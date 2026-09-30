import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PromocaoDaLoja, PromocaoPublica } from '@motoboycity/types';
import type { StorePromotionPayload } from '@motoboycity/validation';
import type { Prisma, StorePromotion, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';

/**
 * O que o servidor sabe da promoção e a página não: quantas vezes já valeu e o
 * limite. É com isso que o pedido confere, na hora de gravar, que ela ainda tem uso.
 */
export interface PromocaoDoServidor extends PromocaoPublica {
  usos: number;
  limiteDeUsos: number | null;
}

function paraPublica(linha: StorePromotion): PromocaoPublica {
  return {
    id: linha.id,
    nome: linha.name,
    tipo: linha.type,
    alvo: linha.target,
    produtoId: linha.productId,
    categoriaId: linha.categoryId,
    percentual: linha.percent,
    precoPromocional: linha.promoPrice === null ? null : Number(linha.promoPrice),
    leve: linha.buyQty,
    pague: linha.payQty,
    inicio: linha.startDate,
    fim: linha.endDate,
    horaInicio: linha.startTime,
    horaFim: linha.endTime,
    diasDaSemana: [...linha.weekdays].sort((a, b) => a - b),
  };
}

function paraALoja(linha: StorePromotion): PromocaoDaLoja {
  return {
    ...paraPublica(linha),
    ativa: linha.active,
    limiteDeUsos: linha.maxUses,
    usos: linha.usedCount,
    criadaEm: linha.createdAt.toISOString(),
    atualizadaEm: linha.updatedAt.toISOString(),
  };
}

/** Acabou o limite: ela não vale mais, e nem chega à página. */
function esgotada(linha: StorePromotion): boolean {
  return linha.maxUses !== null && linha.usedCount >= linha.maxUses;
}

/** A mais antiga primeiro: é a ordem do desempate entre duas promoções iguais. */
const ORDEM_DA_CONTA: Prisma.StorePromotionOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

function naoAchada(): NotFoundException {
  return new NotFoundException({
    message: 'Promoção não encontrada.',
    code: 'STORE_PROMOTION_NOT_FOUND',
  });
}

/**
 * Marketing → Promoções, do lado do painel — e o que a página e o pedido leem.
 *
 * Toda rota do painel resolve a empresa pelo login (`resolveCompanyId`) e filtra
 * por ela: uma loja só enxerga e mexe nas promoções dela. O `id` que vem da URL
 * nunca basta sozinho — é sempre procurado JUNTO da empresa, e o que é de outra
 * responde "não encontrada", sem confirmar que existe.
 */
@Injectable()
export class StoreMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
  ) {}

  async promotions(user: User): Promise<PromocaoDaLoja[]> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const linhas = await this.prisma.storePromotion.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return linhas.map(paraALoja);
  }

  async createPromotion(user: User, payload: StorePromotionPayload): Promise<PromocaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.conferirAlvo(companyId, payload);
    const linha = await this.prisma.storePromotion.create({
      data: { companyId, ...this.dados(payload) },
    });
    return paraALoja(linha);
  }

  async updatePromotion(
    user: User,
    id: string,
    payload: StorePromotionPayload,
  ): Promise<PromocaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.daEmpresa(companyId, id);
    await this.conferirAlvo(companyId, payload);
    // `updateMany` com a empresa na condição: a segunda defesa, se o `id` de outra
    // loja algum dia passar pela leitura acima.
    const { count } = await this.prisma.storePromotion.updateMany({
      where: { id, companyId },
      data: this.dados(payload),
    });
    if (count !== 1) throw naoAchada();
    return paraALoja(await this.daEmpresa(companyId, id));
  }

  async setPromotionActive(user: User, id: string, ativa: boolean): Promise<PromocaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storePromotion.updateMany({
      where: { id, companyId },
      data: { active: ativa },
    });
    if (count !== 1) throw naoAchada();
    return paraALoja(await this.daEmpresa(companyId, id));
  }

  async deletePromotion(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storePromotion.deleteMany({ where: { id, companyId } });
    if (count !== 1) throw naoAchada();
    return { deleted: true };
  }

  /** Copia a promoção, desligada e sem os usos: quem duplica vai mudar alguma coisa antes de ligar. */
  async duplicatePromotion(user: User, id: string): Promise<PromocaoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const original = await this.daEmpresa(companyId, id);
    const nome = `${original.name.slice(0, 52)} (cópia)`;
    const linha = await this.prisma.storePromotion.create({
      data: {
        companyId,
        name: nome,
        type: original.type,
        target: original.target,
        productId: original.productId,
        categoryId: original.categoryId,
        percent: original.percent,
        promoPrice: original.promoPrice,
        buyQty: original.buyQty,
        payQty: original.payQty,
        startDate: original.startDate,
        endDate: original.endDate,
        startTime: original.startTime,
        endTime: original.endTime,
        weekdays: original.weekdays,
        maxUses: original.maxUses,
        active: false,
      },
    });
    return paraALoja(linha);
  }

  /**
   * As promoções que a página do cliente recebe: ligadas e com uso. Uma consulta,
   * junto da loja — a página não volta ao servidor a cada produto.
   */
  async promocoesPublicas(companyId: string): Promise<PromocaoPublica[]> {
    const linhas = await this.prisma.storePromotion.findMany({
      where: { companyId, active: true },
      orderBy: ORDEM_DA_CONTA,
    });
    return linhas.filter((linha) => !esgotada(linha)).map(paraPublica);
  }

  /** As mesmas, com os usos: é o que o pedido confere ao gravar. */
  async promocoesDoPedido(companyId: string): Promise<PromocaoDoServidor[]> {
    const linhas = await this.prisma.storePromotion.findMany({
      where: { companyId, active: true },
      orderBy: ORDEM_DA_CONTA,
    });
    return linhas
      .filter((linha) => !esgotada(linha))
      .map((linha) => ({
        ...paraPublica(linha),
        usos: linha.usedCount,
        limiteDeUsos: linha.maxUses,
      }));
  }

  private async daEmpresa(companyId: string, id: string): Promise<StorePromotion> {
    const linha = await this.prisma.storePromotion.findFirst({ where: { id, companyId } });
    if (!linha) throw naoAchada();
    return linha;
  }

  /**
   * O produto ou a seção têm de ser DESTA empresa: o `id` chega do navegador, e
   * uma promoção presa ao produto de outra loja baixaria o preço dele.
   */
  private async conferirAlvo(companyId: string, payload: StorePromotionPayload): Promise<void> {
    if (payload.alvo === 'CATEGORIA') {
      const secao = await this.prisma.storeCategory.findFirst({
        where: { id: payload.categoriaId ?? '', companyId },
        select: { id: true },
      });
      if (!secao) {
        throw new ConflictException({
          message: 'Essa seção não existe mais. Escolha outra.',
          code: 'STORE_PROMOTION_TARGET_NOT_FOUND',
        });
      }
      return;
    }
    const produto = await this.prisma.storeProduct.findFirst({
      where: { id: payload.produtoId ?? '', companyId },
      select: { kind: true, price: true, sizes: { select: { id: true }, take: 1 } },
    });
    if (!produto) {
      throw new ConflictException({
        message: 'Esse produto não existe mais. Escolha outro.',
        code: 'STORE_PROMOTION_TARGET_NOT_FOUND',
      });
    }
    // O preço do combo já é o especial: promoção nele seria letra morta (o pedido a ignora).
    if (produto.kind === 'COMBO') {
      throw new ConflictException({
        message: 'O combo já tem um preço especial e não entra em promoção. Escolha um produto.',
        code: 'STORE_PROMOTION_TARGET_IS_COMBO',
      });
    }
    if (payload.tipo !== 'PRECO') return;
    // O preço promocional troca o preço do produto: com tamanhos há vários preços,
    // e trocá-los por um só não é o que a loja quer dizer.
    if (produto.sizes.length > 0 || produto.price === null) {
      throw new ConflictException({
        message:
          'O preço promocional vale para produto de um preço só. Para este, use o desconto em %.',
        code: 'STORE_PROMOTION_PRICE_NEEDS_SINGLE_PRICE',
      });
    }
    if ((payload.precoPromocional ?? 0) >= Number(produto.price)) {
      throw new ConflictException({
        message: `O preço promocional precisa ser menor que o preço atual, R$ ${Number(produto.price).toFixed(2).replace('.', ',')}.`,
        code: 'STORE_PROMOTION_PRICE_NOT_LOWER',
      });
    }
  }

  private dados(payload: StorePromotionPayload) {
    return {
      name: payload.nome,
      type: payload.tipo,
      target: payload.alvo,
      productId: payload.produtoId,
      categoryId: payload.categoriaId,
      percent: payload.percentual,
      promoPrice: payload.precoPromocional,
      buyQty: payload.leve,
      payQty: payload.pague,
      startDate: payload.inicio,
      endDate: payload.fim,
      startTime: payload.horaInicio,
      endTime: payload.horaFim,
      weekdays: [...payload.diasDaSemana].sort((a, b) => a - b),
      maxUses: payload.limiteDeUsos,
      active: payload.ativa,
    };
  }
}
