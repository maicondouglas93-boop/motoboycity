import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type {
  CompanyFinancialPosition,
  CompanyFinancialSummary,
  CompanyPeriodTotals,
  CompanyUnbilledDeliveries,
} from '@motoboycity/types';
import type { CompanyFinancialSummaryQuery } from '@motoboycity/validation';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialClock } from './financial-clock.service';
import { InvoiceService } from './invoice.service';
import { nextInvoiceClosingDateInSaoPaulo } from './finance-release.utils';
import {
  dateInSaoPaulo,
  endOfDayInSaoPaulo,
  startOfDayInSaoPaulo,
} from '../common/sao-paulo-time';

/**
 * O financeiro visto pela LOJA.
 *
 * Espelha o `AdminFinancialService`, mas com uma diferença que não é detalhe: a
 * empresa vem sempre do TOKEN, nunca de parâmetro. Aceitar `companyId` na
 * requisição deixaria uma loja ler o financeiro de outra.
 */
@Injectable()
export class CompanyFinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
    private readonly clock: FinancialClock,
  ) {}

  async position(user: User): Promise<CompanyFinancialPosition> {
    const companyId = await this.resolverEmpresa(user);

    /**
     * Atualiza o vencimento antes de somar.
     *
     * Sem isto, fatura que venceu hoje ainda contaria como "a vencer" — e a
     * loja veria zero em atraso justamente no dia em que precisa agir.
     */
    await this.invoiceService.refreshOverdueInvoices();

    const [aVencer, vencidas, semFatura, maisAntiga] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'PENDING' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'OVERDUE' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.delivery.aggregate({
        // Mesma regra do admin: pedido pago online nunca vira fatura, entao
        // nao entra em "ainda nao faturado".
        where: { companyId, status: 'COMPLETED', paymentMethod: 'BILLED', invoiceId: null },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.invoice.findFirst({
        where: { companyId, status: 'OVERDUE' },
        orderBy: { dueDate: 'asc' },
        select: { dueDate: true },
      }),
    ]);

    const valorAVencer = Number(aVencer._sum.totalValue ?? 0);
    const valorVencido = Number(vencidas._sum.totalValue ?? 0);
    const valorSemFatura = Number(semFatura._sum.totalValue ?? 0);

    return {
      notDue: { count: aVencer._count._all, value: valorAVencer },
      overdue: {
        count: vencidas._count._all,
        value: valorVencido,
        maxOverdueDays: maisAntiga ? this.diasDeAtraso(maisAntiga.dueDate) : 0,
      },
      unbilled: { count: semFatura._count._all, value: valorSemFatura },
      // Em centavos inteiros: somar float aqui faria o total exibido divergir
      // da soma das partes que aparecem logo acima dele.
      totalOpen:
        (Math.round(valorAVencer * 100) +
          Math.round(valorVencido * 100) +
          Math.round(valorSemFatura * 100)) /
        100,
      nextClosingDate: nextInvoiceClosingDateInSaoPaulo(this.clock.now()),
    };
  }

  /**
   * Os pedidos que vao entrar na proxima fatura, item a item.
   *
   * Mesma regra do cartao "ainda nao faturado" do resumo: se as duas telas
   * divergissem, a loja nao saberia em qual acreditar.
   */
  async unbilledDeliveries(user: User): Promise<CompanyUnbilledDeliveries> {
    const companyId = await this.resolverEmpresa(user);

    const pedidos = await this.prisma.delivery.findMany({
      where: { companyId, status: 'COMPLETED', paymentMethod: 'BILLED', invoiceId: null },
      orderBy: { statusChangedAt: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        // Em pedido COMPLETED, e a hora em que ele foi concluido. Mesmo campo
        // que o detalhe da fatura usa: divergir aqui daria duas datas para o
        // mesmo pedido.
        statusChangedAt: true,
        totalValue: true,
        serviceType: { select: { name: true } },
        addresses: {
          where: { type: 'DROPOFF' },
          select: { street: true, number: true, city: true },
          take: 1,
        },
      },
    });

    const itens = pedidos.map((pedido) => ({
      id: pedido.id,
      displayNumber: pedido.displayNumber,
      completedAt: pedido.statusChangedAt.toISOString(),
      dropoffAddress: this.enderecoLegivel(pedido.addresses[0]),
      serviceTypeName: pedido.serviceType?.name ?? null,
      totalValue: Number(pedido.totalValue ?? 0),
    }));

    // Em centavos inteiros, pelo mesmo motivo do `totalOpen`.
    const totalEmCentavos = itens.reduce(
      (soma, item) => soma + Math.round(item.totalValue * 100),
      0,
    );

    return {
      items: itens,
      count: itens.length,
      total: totalEmCentavos / 100,
      closingDate: nextInvoiceClosingDateInSaoPaulo(this.clock.now()),
    };
  }

  /**
   * Endereco de destino em uma linha.
   *
   * Pode nao existir: entrega com destino capturado por GPS guarda so lat/lng,
   * sem geocodificacao reversa. Nesse caso a loja ve o aviso em vez de uma
   * linha vazia que pareceria defeito.
   */
  private enderecoLegivel(
    endereco: { street: string | null; number: string | null; city: string | null } | undefined,
  ): string {
    if (!endereco?.street) return 'Destino informado na entrega';
    const rua = endereco.number ? `${endereco.street}, ${endereco.number}` : endereco.street;
    return endereco.city ? `${rua} - ${endereco.city}` : rua;
  }

  /**
   * Gasto da loja no periodo, comparado com o periodo anterior.
   *
   * Agregado no servidor de proposito. A tela de indicadores baixava a lista
   * inteira de entregas para somar no navegador: com 22 pedidos funciona, com
   * um mes de operacao real vira milhares de linhas atravessando a rede para
   * calcular uma media.
   */
  async summary(
    user: User,
    query: CompanyFinancialSummaryQuery,
  ): Promise<CompanyFinancialSummary> {
    const companyId = await this.resolverEmpresa(user);

    const inicio = startOfDayInSaoPaulo(query.from);
    const fimExclusivo = new Date(endOfDayInSaoPaulo(query.to).getTime() + 1);
    const duracao = fimExclusivo.getTime() - inicio.getTime();
    // O periodo anterior tem exatamente a mesma duracao, encostado no inicio
    // deste. Comparar com "o mes passado" de tamanho diferente daria variacao
    // que nao quer dizer nada.
    const inicioAnterior = new Date(inicio.getTime() - duracao);

    const [atual, anterior, porModalidade, serieDiaria, porStatus, comRetorno] =
      await Promise.all([
      this.totaisDoPeriodo(companyId, inicio, fimExclusivo),
      this.totaisDoPeriodo(companyId, inicioAnterior, inicio),
      this.prisma.delivery.groupBy({
        by: ['serviceTypeId'],
        where: { companyId, createdAt: { gte: inicio, lt: fimExclusivo } },
        _count: { _all: true },
        orderBy: { _count: { serviceTypeId: 'desc' } },
        take: 1,
      }),
      this.serieDiariaDoPeriodo(companyId, inicio, fimExclusivo),
      this.prisma.delivery.groupBy({
        by: ['status'],
        where: { companyId, createdAt: { gte: inicio, lt: fimExclusivo } },
        _count: { _all: true },
      }),
      this.prisma.delivery.count({
        where: { companyId, createdAt: { gte: inicio, lt: fimExclusivo }, requiresReturn: true },
      }),
    ]);

    let modalidade: { name: string; count: number } | null = null;
    const maisUsada = porModalidade[0];
    if (maisUsada) {
      const tipo = await this.prisma.serviceType.findUnique({
        where: { id: maisUsada.serviceTypeId },
        select: { name: true },
      });
      modalidade = { name: tipo?.name ?? 'Sem nome', count: maisUsada._count._all };
    }

    return {
      from: query.from,
      to: query.to,
      current: atual,
      // Sem movimento antes nao ha com o que comparar. Devolver zeros faria a
      // tela mostrar "+100%" para a primeira semana de uso da loja.
      previous: anterior.count === 0 ? null : anterior,
      topServiceType: modalidade,
      daily: serieDiaria,
      byStatus: Object.fromEntries(
        porStatus.map((linha) => [linha.status, linha._count._all]),
      ),
      requiresReturnCount: comRetorno,
    };
  }

  /** Contagem e valor de um intervalo, agregados no banco. */
  private async totaisDoPeriodo(
    companyId: string,
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<CompanyPeriodTotals> {
    const periodo = { gte: inicio, lt: fimExclusivo };
    const [todos, concluidos, cancelados] = await Promise.all([
      this.prisma.delivery.aggregate({
        where: { companyId, createdAt: periodo },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.delivery.aggregate({
        where: { companyId, createdAt: periodo, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.delivery.count({
        where: { companyId, createdAt: periodo, status: 'CANCELLED' },
      }),
    ]);

    const quantidade = todos._count._all;
    const valor = Number(todos._sum.totalValue ?? 0);

    return {
      count: quantidade,
      completed: concluidos._count._all,
      cancelled: cancelados,
      value: valor,
      completedValue: Number(concluidos._sum.totalValue ?? 0),
      // Sem pedido nao existe ticket medio. Zero seria uma resposta errada
      // disfarçada de numero.
      averageTicket: quantidade === 0 ? 0 : Math.round((valor / quantidade) * 100) / 100,
    };
  }

  /**
   * Serie diaria agrupada no FUSO DA OPERACAO.
   *
   * Agrupar por data UTC jogaria todo pedido feito depois das 21h para o dia
   * seguinte — justamente o horario de pico da entrega.
   */
  private async serieDiariaDoPeriodo(
    companyId: string,
    inicio: Date,
    fimExclusivo: Date,
  ): Promise<Array<{ date: string; count: number; value: number }>> {
    const porDia = new Map<string, { count: number; centavos: number }>();
    let cursor: string | undefined;

    do {
      const pedidos = await this.prisma.delivery.findMany({
        where: { companyId, createdAt: { gte: inicio, lt: fimExclusivo } },
        select: { id: true, createdAt: true, totalValue: true },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      for (const pedido of pedidos) {
        const dia = dateInSaoPaulo(pedido.createdAt);
        const acumulado = porDia.get(dia) ?? { count: 0, centavos: 0 };
        acumulado.count += 1;
        acumulado.centavos += Math.round(Number(pedido.totalValue ?? 0) * 100);
        porDia.set(dia, acumulado);
      }

      if (pedidos.length < 500) break;
      cursor = pedidos.at(-1)?.id;
    } while (cursor);

    return [...porDia.entries()]
      .sort(([esquerda], [direita]) => esquerda.localeCompare(direita))
      .map(([date, { count, centavos }]) => ({ date, count, value: centavos / 100 }));
  }

  /**
   * Extrato de pedidos do periodo, em CSV.
   *
   * Gerado no SERVIDOR. Montar no navegador exigiria baixar a lista inteira de
   * entregas — o mesmo problema que o `summary` veio resolver, so que com um
   * botao chamando por cima.
   *
   * Separador `;` e decimal com virgula: e o que o Excel em portugues abre sem
   * pedir importacao.
   */
  async exportCsv(user: User, query: CompanyFinancialSummaryQuery): Promise<string> {
    const companyId = await this.resolverEmpresa(user);

    const inicio = startOfDayInSaoPaulo(query.from);
    const fimExclusivo = new Date(endOfDayInSaoPaulo(query.to).getTime() + 1);

    const pedidos = await this.prisma.delivery.findMany({
      where: { companyId, createdAt: { gte: inicio, lt: fimExclusivo } },
      orderBy: { createdAt: 'asc' },
      select: {
        displayNumber: true,
        createdAt: true,
        status: true,
        paymentMethod: true,
        totalValue: true,
        serviceType: { select: { name: true } },
        invoice: { select: { number: true } },
        addresses: {
          where: { type: 'DROPOFF' },
          select: { street: true, number: true, city: true },
          take: 1,
        },
      },
    });

    const cabecalho = [
      'Pedido',
      'Data',
      'Status',
      'Modalidade',
      'Destino',
      'Pagamento',
      'Fatura',
      'Valor',
    ];

    const linhas = pedidos.map((pedido) => [
      String(pedido.displayNumber),
      dateInSaoPaulo(pedido.createdAt),
      pedido.status,
      pedido.serviceType?.name ?? '',
      this.enderecoLegivel(pedido.addresses[0]),
      pedido.paymentMethod,
      // Sem fatura ainda: o campo vazio seria ambiguo com "fatura sem numero".
      pedido.invoice?.number ?? 'Sem fatura',
      Number(pedido.totalValue ?? 0).toFixed(2).replace('.', ','),
    ]);

    return montarCsv(cabecalho, linhas);
  }

  /**
   * A empresa do usuário logado.
   *
   * Lança em vez de devolver nulo: chegar aqui sem vínculo com empresa é erro
   * de permissão, e tratar como "sem dados" mostraria uma tela zerada em vez
   * de dizer o que houve.
   */
  private async resolverEmpresa(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const vinculo = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!vinculo) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    return vinculo.companyId;
  }

  /** Dias inteiros desde o vencimento, nunca negativo. */
  private diasDeAtraso(vencimento: Date): number {
    const umDia = 24 * 60 * 60 * 1000;
    const diferenca = this.clock.now().getTime() - vencimento.getTime();
    return Math.max(0, Math.floor(diferenca / umDia));
  }

}

const SEPARADOR = ';';
/** CRLF: a quebra de linha que o Excel espera num CSV. */
const QUEBRA_DE_LINHA = '\r\n';
/** Sem BOM o Excel le o arquivo como Latin-1 e "Joao" vira "JoÃ£o". */
const BOM = '﻿';

function escaparCelula(valor: string): string {
  /**
   * Excel executa celula que comeca com `=`, `+` ou `@` como formula. Nome de
   * rua e nome de modalidade vem de quem cadastrou: precisam chegar como
   * texto.
   */
  let texto = valor;
  if (/^[=+@]/.test(texto.trimStart())) {
    texto = `'${texto}`;
  }
  if (texto.includes(SEPARADOR) || texto.includes('"') || texto.includes('\n')) {
    return `"${texto.replaceAll('"', '""')}"`;
  }
  return texto;
}

function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const linhasCsv = [cabecalho, ...linhas].map((linha) =>
    linha.map(escaparCelula).join(SEPARADOR),
  );
  return BOM + linhasCsv.join(QUEBRA_DE_LINHA);
}
