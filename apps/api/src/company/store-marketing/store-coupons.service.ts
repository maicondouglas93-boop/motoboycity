import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CupomDaLoja, CupomDisponivel, CupomPublico } from '@motoboycity/types';
import {
  CODIGO_DO_CUPOM,
  datasDoCupom,
  normalizarCodigoDoCupom,
  type StoreCouponPayload,
} from '@motoboycity/validation';
import { Prisma, type StoreCoupon, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';

/**
 * O que o servidor sabe do cupom e a página não: quantas vezes já valeu, o
 * limite e o limite por cliente. É com isso que o pedido confere, na hora de
 * gravar, que ele ainda tem uso.
 */
export interface CupomDoServidor extends CupomPublico {
  id: string;
  usos: number;
  limiteDeUsos: number | null;
  limitePorCliente: number | null;
}

function numero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}

function paraPublico(linha: StoreCoupon): CupomPublico {
  return {
    codigo: linha.code,
    tipo: linha.type === 'PERCENT' ? 'PERCENTUAL' : 'VALOR',
    percentual: linha.percent,
    valor: numero(linha.amount),
    pedidoMinimo: numero(linha.minOrder),
    descontoMaximo: numero(linha.maxDiscount),
    valeEmPromocao: linha.appliesToPromoItems,
    produtoIds: [...linha.productIds],
    categoriaIds: [...linha.categoryIds],
  };
}

/** O que a página recebe do cupom: as regras, sem o que só o servidor sabe (usos e limites). */
export function publicoDoCupom(cupom: CupomDoServidor): CupomPublico {
  return {
    codigo: cupom.codigo,
    tipo: cupom.tipo,
    percentual: cupom.percentual,
    valor: cupom.valor,
    pedidoMinimo: cupom.pedidoMinimo,
    descontoMaximo: cupom.descontoMaximo,
    valeEmPromocao: cupom.valeEmPromocao,
    produtoIds: cupom.produtoIds,
    categoriaIds: cupom.categoriaIds,
  };
}

function paraALoja(linha: StoreCoupon): CupomDaLoja {
  return {
    ...paraPublico(linha),
    id: linha.id,
    ativo: linha.active,
    mostrarNoCheckout: linha.showInCheckout,
    inicio: linha.startDate,
    fim: linha.endDate,
    limiteDeUsos: linha.maxUses,
    limitePorCliente: linha.maxUsesPerCustomer,
    usos: linha.usedCount,
    criadoEm: linha.createdAt.toISOString(),
    atualizadoEm: linha.updatedAt.toISOString(),
  };
}

/** `AAAA-MM-DD` na língua do cliente. */
function dataBr(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** A lista do checkout é para escolher com o olho: passando disso, vira um catálogo de códigos. */
export const MAXIMO_DE_CUPONS_NA_LISTA = 12;

function naoAchado(): NotFoundException {
  return new NotFoundException({
    message: 'Cupom não encontrado.',
    code: 'STORE_COUPON_NOT_FOUND',
  });
}

/** Cada recusa do cupom tem o código que a tela e o teste leem, e a frase que o cliente lê. */
function recusa(code: string, message: string): ConflictException {
  return new ConflictException({ message, code });
}

function codigoRepetido(codigo: string): ConflictException {
  return recusa('STORE_COUPON_CODE_TAKEN', `Já existe um cupom com o código ${codigo}.`);
}

/**
 * Marketing → Cupons, do lado do painel — e o que o checkout lê.
 *
 * Toda rota do painel resolve a empresa pelo login (`resolveCompanyId`) e filtra
 * por ela: uma loja só enxerga e mexe nos cupons dela. O `id` que vem da URL nunca
 * basta sozinho — é sempre procurado JUNTO da empresa, e o que é de outra
 * responde "não encontrado", sem confirmar que existe. O código é único DENTRO da
 * loja: duas lojas podem ter o mesmo, e um cupom de uma nunca vale na outra.
 */
@Injectable()
export class StoreCouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
  ) {}

  async coupons(user: User): Promise<CupomDaLoja[]> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const linhas = await this.prisma.storeCoupon.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return linhas.map(paraALoja);
  }

  async createCoupon(user: User, payload: StoreCouponPayload): Promise<CupomDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.conferirAlcance(companyId, payload);
    try {
      const linha = await this.prisma.storeCoupon.create({
        data: { companyId, ...this.dados(payload) },
      });
      return paraALoja(linha);
    } catch (erro) {
      throw this.traduzir(erro, payload.codigo);
    }
  }

  async updateCoupon(user: User, id: string, payload: StoreCouponPayload): Promise<CupomDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.daEmpresa(companyId, id);
    await this.conferirAlcance(companyId, payload);
    try {
      // `updateMany` com a empresa na condição: a segunda defesa, se o `id` de outra
      // loja algum dia passar pela leitura acima.
      const { count } = await this.prisma.storeCoupon.updateMany({
        where: { id, companyId },
        data: this.dados(payload),
      });
      if (count !== 1) throw naoAchado();
    } catch (erro) {
      throw this.traduzir(erro, payload.codigo);
    }
    return paraALoja(await this.daEmpresa(companyId, id));
  }

  async setCouponActive(user: User, id: string, ativo: boolean): Promise<CupomDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storeCoupon.updateMany({
      where: { id, companyId },
      data: { active: ativo },
    });
    if (count !== 1) throw naoAchado();
    return paraALoja(await this.daEmpresa(companyId, id));
  }

  async deleteCoupon(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storeCoupon.deleteMany({ where: { id, companyId } });
    if (count !== 1) throw naoAchado();
    return { deleted: true };
  }

  /**
   * Copia o cupom, desligado e sem os usos. O código é único na loja, então a
   * cópia ganha um número no fim (`BEMVINDO10-2`): quem duplica vai trocá-lo.
   */
  async duplicateCoupon(user: User, id: string): Promise<CupomDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const original = await this.daEmpresa(companyId, id);
    const codigo = await this.codigoLivre(companyId, original.code);
    const linha = await this.prisma.storeCoupon.create({
      data: {
        companyId,
        code: codigo,
        type: original.type,
        percent: original.percent,
        amount: original.amount,
        minOrder: original.minOrder,
        maxDiscount: original.maxDiscount,
        startDate: original.startDate,
        endDate: original.endDate,
        maxUses: original.maxUses,
        maxUsesPerCustomer: original.maxUsesPerCustomer,
        productIds: original.productIds,
        categoryIds: original.categoryIds,
        appliesToPromoItems: original.appliesToPromoItems,
        showInCheckout: original.showInCheckout,
        active: false,
      },
    });
    return paraALoja(linha);
  }

  /**
   * O cupom que o cliente digitou, conferido para ESTE cliente agora: existe nesta
   * loja, está ligado, dentro das datas, com uso e com o limite por cliente. Cada
   * recusa diz o que houve. Quem chama ainda confere o que depende da sacola
   * (`aplicarCupom`), e o pedido refaz a contagem dentro da transação: aqui é só
   * a leitura que dá a recusa clara, sem esperar o fim do checkout.
   */
  async paraOPedido(
    companyId: string,
    clienteId: string,
    codigoDigitado: string,
    agora: Date,
  ): Promise<CupomDoServidor> {
    const codigo = normalizarCodigoDoCupom(codigoDigitado);
    // Um texto que nem seria um código não vai ao banco.
    const linha = CODIGO_DO_CUPOM.test(codigo)
      ? await this.prisma.storeCoupon.findUnique({
          where: { companyId_code: { companyId, code: codigo } },
        })
      : null;
    if (!linha) {
      throw new NotFoundException({
        message: 'Cupom não encontrado. Confira o código.',
        code: 'STORE_COUPON_NOT_FOUND',
      });
    }
    if (!linha.active) {
      throw recusa('STORE_COUPON_INACTIVE', 'Este cupom não está disponível.');
    }
    const datas = datasDoCupom({ inicio: linha.startDate, fim: linha.endDate }, agora);
    if (datas === 'AINDA_NAO' && linha.startDate) {
      throw recusa(
        'STORE_COUPON_NOT_STARTED',
        `Este cupom vale a partir de ${dataBr(linha.startDate)}.`,
      );
    }
    if (datas === 'VENCIDO' && linha.endDate) {
      throw recusa('STORE_COUPON_EXPIRED', `Este cupom venceu em ${dataBr(linha.endDate)}.`);
    }
    if (linha.maxUses !== null && linha.usedCount >= linha.maxUses) {
      throw recusa('STORE_COUPON_EXHAUSTED', 'Este cupom já foi usado todas as vezes.');
    }
    if (linha.maxUsesPerCustomer !== null) {
      const dele = await this.prisma.storeCouponRedemption.count({
        where: { couponId: linha.id, customerAuthId: clienteId },
      });
      if (dele >= linha.maxUsesPerCustomer) {
        throw recusa(
          'STORE_COUPON_CUSTOMER_LIMIT',
          linha.maxUsesPerCustomer === 1
            ? 'Você já usou este cupom.'
            : `Você já usou este cupom ${dele} vezes, que é o limite.`,
        );
      }
    }
    return {
      ...paraPublico(linha),
      id: linha.id,
      usos: linha.usedCount,
      limiteDeUsos: linha.maxUses,
      limitePorCliente: linha.maxUsesPerCustomer,
    };
  }

  /**
   * Os cupons da lista "Cupons" do checkout, para ESTE cliente agora: os que a loja marcou
   * para aparecer, ligados, dentro das datas, com uso e dentro do limite por cliente. Chega
   * ao cliente só o que ele precisa para escolher e para a página calcular o desconto — o
   * que depende da sacola (pedido mínimo, itens alcançados) ela confere com as regras que
   * recebe, e o servidor confere de novo ao aplicar e ao fazer o pedido.
   */
  async disponiveis(companyId: string, clienteId: string, agora: Date): Promise<CupomDisponivel[]> {
    const linhas = await this.prisma.storeCoupon.findMany({
      where: { companyId, active: true, showInCheckout: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const vigentes = linhas.filter(
      (linha) =>
        datasDoCupom({ inicio: linha.startDate, fim: linha.endDate }, agora) === 'VIGENTE' &&
        !(linha.maxUses !== null && linha.usedCount >= linha.maxUses),
    );

    // Quantas vezes ESTE cliente usou cada um: só se pergunta quando algum cupom tem limite por cliente.
    const comLimite = vigentes.filter((linha) => linha.maxUsesPerCustomer !== null);
    const usos = new Map<string, number>();
    if (comLimite.length > 0) {
      const contados = await this.prisma.storeCouponRedemption.groupBy({
        by: ['couponId'],
        where: { couponId: { in: comLimite.map((linha) => linha.id) }, customerAuthId: clienteId },
        _count: { _all: true },
      });
      for (const item of contados) usos.set(item.couponId, item._count._all);
    }

    return vigentes
      .filter(
        (linha) =>
          linha.maxUsesPerCustomer === null || (usos.get(linha.id) ?? 0) < linha.maxUsesPerCustomer,
      )
      .slice(0, MAXIMO_DE_CUPONS_NA_LISTA)
      .map((linha) => ({ ...paraPublico(linha), fim: linha.endDate }));
  }

  private async daEmpresa(companyId: string, id: string): Promise<StoreCoupon> {
    const linha = await this.prisma.storeCoupon.findFirst({ where: { id, companyId } });
    if (!linha) throw naoAchado();
    return linha;
  }

  /**
   * Produtos e seções do cupom têm de ser DESTA empresa: os ids chegam do
   * navegador, e um cupom preso ao produto de outra loja não teria o que alcançar
   * — e revelaria que o id existe.
   */
  private async conferirAlcance(companyId: string, payload: StoreCouponPayload): Promise<void> {
    const [produtos, secoes] = await Promise.all([
      payload.produtoIds.length === 0
        ? 0
        : this.prisma.storeProduct.count({ where: { id: { in: payload.produtoIds }, companyId } }),
      payload.categoriaIds.length === 0
        ? 0
        : this.prisma.storeCategory.count({
            where: { id: { in: payload.categoriaIds }, companyId },
          }),
    ]);
    if (produtos !== payload.produtoIds.length || secoes !== payload.categoriaIds.length) {
      throw recusa(
        'STORE_COUPON_TARGET_NOT_FOUND',
        'Um dos produtos ou uma das seções escolhidas não existe mais. Atualize a lista e escolha de novo.',
      );
    }
  }

  private async codigoLivre(companyId: string, codigo: string): Promise<string> {
    const usados = new Set(
      (
        await this.prisma.storeCoupon.findMany({
          where: { companyId, code: { startsWith: codigo.slice(0, 15) } },
          select: { code: true },
        })
      ).map((item) => item.code),
    );
    for (let numeroDaCopia = 2; numeroDaCopia < 100; numeroDaCopia += 1) {
      const sufixo = `-${numeroDaCopia}`;
      const candidato = `${codigo.slice(0, 20 - sufixo.length)}${sufixo}`;
      if (!usados.has(candidato)) return candidato;
    }
    throw codigoRepetido(codigo);
  }

  private traduzir(erro: unknown, codigo: string): unknown {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      return codigoRepetido(codigo);
    }
    return erro;
  }

  private dados(payload: StoreCouponPayload) {
    return {
      code: payload.codigo,
      type: payload.tipo === 'PERCENTUAL' ? ('PERCENT' as const) : ('FIXED' as const),
      percent: payload.percentual,
      amount: payload.valor,
      minOrder: payload.pedidoMinimo,
      maxDiscount: payload.descontoMaximo,
      startDate: payload.inicio,
      endDate: payload.fim,
      maxUses: payload.limiteDeUsos,
      maxUsesPerCustomer: payload.limitePorCliente,
      productIds: payload.produtoIds,
      categoryIds: payload.categoriaIds,
      appliesToPromoItems: payload.valeEmPromocao,
      showInCheckout: payload.mostrarNoCheckout,
      active: payload.ativo,
    };
  }
}
