import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type {
  AjusteManual,
  BairroAtendido,
  FormaDePagamento,
  OperacaoDaLoja,
  OperacaoPublica,
} from '@motoboycity/types';
import {
  FORMAS_DE_PAGAMENTO_ONLINE,
  type StoreDeliveryAreasPayload,
  type StoreManualStatusPayload,
  type StoreNotificationsPayload,
  type StoreOrderTypesPayload,
  type StorePaymentsPayload,
  type StoreSchedulePayload,
} from '@motoboycity/validation';
import { Prisma, type StoreOperation, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';

type Horario = Pick<OperacaoDaLoja['funcionamento'], 'semana' | 'excecoes' | 'mensagemFechada'>;
type TiposDePedido = Pick<OperacaoDaLoja, 'recebimento' | 'entrega' | 'retirada' | 'agendamento'>;
type Avisos = OperacaoDaLoja['notificacoes'];

/**
 * A loja nova: sem horário — fechada até a loja dizer quando abre —, entrega
 * pelo MOTOboyCity com aceite automático, sem retirada e sem agendamento,
 * pagamento em dinheiro e nenhum bairro. Nada aqui abre a loja sozinho: abrir
 * é cadastrar o horário, e entregar é cadastrar os bairros.
 */
export const OPERACAO_INICIAL: OperacaoDaLoja = {
  funcionamento: {
    semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, faixas: [] })),
    excecoes: [],
    ajuste: null,
    mensagemFechada: '',
  },
  recebimento: {
    modo: 'AUTOMATICO',
    minutosDePreparo: 20,
    minutosDeEntrega: 15,
    prazoDoAceiteMin: 10,
  },
  entrega: {
    ativa: true,
    quemEntrega: 'MOTOBOYCITY',
    pedidoMinimo: null,
    agendamento: false,
    tipoDeServicoId: null,
  },
  retirada: { ativa: false, endereco: null, instrucoes: '', agendamento: false },
  agendamento: {
    permitir: false,
    antecedenciaMinimaMin: 60,
    antecedenciaMaximaDias: 2,
    intervaloMin: 30,
  },
  notificacoes: {
    lojista: {
      NOVO_PEDIDO: { push: true, som: true },
      PEDIDO_CANCELADO: { push: true, som: true },
      PEDIDO_AGENDADO: { push: true, som: false },
      PAGAMENTO_RECEBIDO: { push: true, som: false },
      LOJA_FECHANDO: { push: false, som: true },
    },
    minutosAntesDeFechar: 15,
    repetirSom: true,
    cliente: {
      RECEBIDO: true,
      ACEITO: true,
      EM_PREPARO: false,
      PRONTO_PARA_RETIRAR: true,
      SAIU_PARA_ENTREGA: true,
      ENTREGUE: true,
      CANCELADO: true,
    },
  },
  pagamentos: ['DINHEIRO'],
  bairros: [],
};

/**
 * Pagar online é pelo Asaas, direto na conta da loja, e a conta ainda não tem
 * onde ser cadastrada: sem ela, o dinheiro não teria para onde ir. Quando
 * tiver, esta checagem passa a ser "a loja tem conta Asaas".
 */
const PAGAMENTO_ONLINE_DISPONIVEL = false;

function eOnline(forma: FormaDePagamento): boolean {
  return (FORMAS_DE_PAGAMENTO_ONLINE as readonly string[]).includes(forma);
}

const horarioInicial = (): Horario => {
  const { semana, excecoes, mensagemFechada } = OPERACAO_INICIAL.funcionamento;
  return { semana, excecoes, mensagemFechada };
};
const tiposIniciais = (): TiposDePedido => {
  const { recebimento, entrega, retirada, agendamento } = OPERACAO_INICIAL;
  return { recebimento, entrega, retirada, agendamento };
};

/** O objeto vai como está para a coluna JSON: o Zod já conferiu o formato na entrada. */
function comoJson(valor: unknown): Prisma.InputJsonValue {
  return valor as Prisma.InputJsonValue;
}

/**
 * O que está gravado, completado com a configuração inicial bloco a bloco. Um
 * campo que entrar no formato depois não quebra a loja que salvou antes dele —
 * ela recebe o valor inicial até salvar de novo.
 */
export function completarOperacao(linha: StoreOperation | null): OperacaoDaLoja {
  const base = OPERACAO_INICIAL;
  if (!linha) return base;
  const horario = linha.schedule as unknown as Partial<Horario>;
  const tipos = linha.orderTypes as unknown as Partial<TiposDePedido>;
  const avisos = linha.notifications as unknown as Partial<Avisos>;
  return {
    funcionamento: {
      ...base.funcionamento,
      ...horario,
      ajuste: (linha.manualStatus as unknown as AjusteManual | null) ?? null,
    },
    recebimento: { ...base.recebimento, ...tipos.recebimento },
    entrega: { ...base.entrega, ...tipos.entrega },
    retirada: { ...base.retirada, ...tipos.retirada },
    agendamento: { ...base.agendamento, ...tipos.agendamento },
    notificacoes: {
      ...base.notificacoes,
      ...avisos,
      lojista: { ...base.notificacoes.lojista, ...avisos.lojista },
      cliente: { ...base.notificacoes.cliente, ...avisos.cliente },
    },
    pagamentos: (linha.paymentMethods as unknown as FormaDePagamento[] | null) ?? base.pagamentos,
    bairros: (linha.deliveryAreas as unknown as BairroAtendido[] | null) ?? base.bairros,
  };
}

/**
 * Como a loja online funciona, do lado do painel — e a parte que a página do
 * cliente recebe.
 *
 * Cada bloco tem a própria coluna e a própria gravação: a tela de Horários
 * salva o horário, o controle da situação salva o ajuste, e um não desfaz o
 * outro, mesmo com as duas telas abertas.
 */
@Injectable()
export class StoreOperationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
  ) {}

  async operation(user: User): Promise<OperacaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    return this.daEmpresa(companyId);
  }

  /** A operação inteira de uma empresa, para quem já sabe qual é (os avisos do pedido). */
  operacaoDaEmpresa(companyId: string): Promise<OperacaoDaLoja> {
    return this.daEmpresa(companyId);
  }

  /**
   * A operação sem os avisos da loja: é o que a página do cliente recebe. As
   * formas online saem se não há para onde o dinheiro ir — a gravação já as
   * recusa, e a página confere de novo.
   */
  async publicOperation(companyId: string): Promise<OperacaoPublica> {
    const { notificacoes: _avisos, ...publica } = await this.daEmpresa(companyId);
    return {
      ...publica,
      pagamentos: publica.pagamentos.filter(
        (forma) => PAGAMENTO_ONLINE_DISPONIVEL || !eOnline(forma),
      ),
    };
  }

  updateSchedule(user: User, payload: StoreSchedulePayload): Promise<OperacaoDaLoja> {
    const horario: Horario = payload;
    return this.gravar(user, { schedule: comoJson(horario) });
  }

  /**
   * O começo do ajuste é a hora do servidor, e não a do aparelho: um celular
   * com o relógio errado não pode pausar a loja no passado. Um fim que já
   * passou é recusado, em vez de gravar um ajuste que nasce vencido.
   */
  async updateStatus(user: User, { ajuste }: StoreManualStatusPayload): Promise<OperacaoDaLoja> {
    const agora = new Date();
    if (ajuste?.ate && new Date(ajuste.ate).getTime() <= agora.getTime()) {
      throw new BadRequestException({
        message: 'O fim deste ajuste já passou. Escolha outro horário.',
        code: 'STORE_STATUS_ENDED',
      });
    }
    const valor: AjusteManual | null = ajuste
      ? { estado: ajuste.estado, desde: agora.toISOString(), ate: ajuste.ate }
      : null;
    return this.gravar(user, { manualStatus: valor ? comoJson(valor) : Prisma.DbNull });
  }

  /**
   * O tipo de serviço da corrida passa pela mesma conferência da integração
   * aiqfome: ativo, e com tabela de preço na região da empresa — sem ela, a
   * corrida não teria preço, e só se saberia no primeiro pedido. Sem o campo
   * (aba aberta antes de ele existir), fica o que estava gravado.
   */
  async updateOrderTypes(user: User, payload: StoreOrderTypesPayload): Promise<OperacaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    let tipoDeServicoId = payload.entrega.tipoDeServicoId;
    if (tipoDeServicoId === undefined) {
      tipoDeServicoId = (await this.daEmpresa(companyId)).entrega.tipoDeServicoId;
    } else if (tipoDeServicoId !== null) {
      await this.conferirTipoDeServico(companyId, tipoDeServicoId);
    }
    const tipos: TiposDePedido = {
      ...payload,
      entrega: { ...payload.entrega, tipoDeServicoId },
    };
    return this.gravar(user, { orderTypes: comoJson(tipos) });
  }

  /**
   * O tipo de serviço da corrida que nasce de um pedido: o escolhido em Tipos
   * de pedido ou, sem escolha, o primeiro ativo — o mesmo que o botão "Chamar"
   * do painel traz marcado. O escolhido que deixou de valer é recusado, em vez
   * de trocado em silêncio por outro, de outro preço.
   */
  async tipoDeServicoDaCorrida(companyId: string): Promise<string> {
    const escolhido = (await this.daEmpresa(companyId)).entrega.tipoDeServicoId;
    if (escolhido) {
      await this.conferirTipoDeServico(companyId, escolhido);
      return escolhido;
    }
    const primeiro = await this.prisma.serviceType.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!primeiro) {
      throw new ConflictException({
        message: 'Não há tipo de serviço ativo para chamar o motoboy. Fale com a central.',
        code: 'STORE_SERVICE_TYPE_UNAVAILABLE',
      });
    }
    return primeiro.id;
  }

  private async conferirTipoDeServico(companyId: string, tipoDeServicoId: string): Promise<void> {
    const [tipo, empresa] = await Promise.all([
      this.prisma.serviceType.findFirst({
        where: { id: tipoDeServicoId, active: true },
        select: { id: true },
      }),
      this.prisma.company.findUnique({ where: { id: companyId }, select: { regionId: true } }),
    ]);
    if (!tipo) {
      throw new ConflictException({
        message:
          'O tipo de serviço escolhido em Tipos de pedido não está mais ativo. Escolha outro.',
        code: 'STORE_SERVICE_TYPE_UNAVAILABLE',
      });
    }
    const tabela = await this.prisma.pricingTable.findFirst({
      where: {
        regionId: empresa?.regionId,
        serviceTypeId: tipoDeServicoId,
        active: true,
        OR: [{ companyId }, { companyId: null }],
      },
      select: { id: true },
    });
    if (!tabela) {
      throw new ConflictException({
        message: 'Este tipo de serviço não tem preço na sua região. Escolha outro.',
        code: 'STORE_SERVICE_TYPE_UNPRICED',
      });
    }
  }

  updateNotifications(user: User, payload: StoreNotificationsPayload): Promise<OperacaoDaLoja> {
    const avisos: Avisos = payload;
    return this.gravar(user, { notifications: comoJson(avisos) });
  }

  async updatePayments(user: User, { pagamentos }: StorePaymentsPayload): Promise<OperacaoDaLoja> {
    if (!PAGAMENTO_ONLINE_DISPONIVEL && pagamentos.some(eOnline)) {
      throw new BadRequestException({
        message: 'Receber online depende da conta Asaas da loja, que ainda não está disponível.',
        code: 'STORE_PAYMENT_ONLINE_UNAVAILABLE',
      });
    }
    return this.gravar(user, { paymentMethods: comoJson(pagamentos) });
  }

  updateDeliveryAreas(user: User, { bairros }: StoreDeliveryAreasPayload): Promise<OperacaoDaLoja> {
    return this.gravar(user, { deliveryAreas: comoJson(bairros) });
  }

  /** Grava só o bloco pedido; os outros ficam como estão — ou nascem com o inicial. */
  private async gravar(
    user: User,
    bloco: Prisma.StoreOperationUpdateInput,
  ): Promise<OperacaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const inicial = OPERACAO_INICIAL;
    await this.prisma.storeOperation.upsert({
      where: { companyId },
      create: {
        company: { connect: { id: companyId } },
        schedule: comoJson(horarioInicial()),
        orderTypes: comoJson(tiposIniciais()),
        notifications: comoJson(inicial.notificacoes),
        ...bloco,
      } as Prisma.StoreOperationCreateInput,
      update: bloco,
    });
    return this.daEmpresa(companyId);
  }

  private async daEmpresa(companyId: string): Promise<OperacaoDaLoja> {
    const linha = await this.prisma.storeOperation.findUnique({ where: { companyId } });
    return completarOperacao(linha);
  }
}
