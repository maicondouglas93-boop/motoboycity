import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DestaqueDaLoja, DestaquePublico } from '@motoboycity/types';
import {
  MAXIMO_DE_DESTAQUES,
  momentoNaLoja,
  type StoreHighlightPayload,
} from '@motoboycity/validation';
import type { StoreHighlight, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';

function paraPublico(linha: StoreHighlight): DestaquePublico {
  return {
    id: linha.id,
    titulo: linha.title,
    produtoIds: [...linha.productIds],
    inicio: linha.startDate,
    fim: linha.endDate,
  };
}

function paraALoja(linha: StoreHighlight): DestaqueDaLoja {
  return {
    ...paraPublico(linha),
    ativo: linha.active,
    posicao: linha.position,
    criadoEm: linha.createdAt.toISOString(),
    atualizadoEm: linha.updatedAt.toISOString(),
  };
}

/** A ordem do cardápio: pela posição, e o mais antigo primeiro quando há empate. */
const ORDEM = [{ position: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

function naoAchado(): NotFoundException {
  return new NotFoundException({
    message: 'Destaque não encontrado.',
    code: 'STORE_HIGHLIGHT_NOT_FOUND',
  });
}

function recusa(code: string, message: string): ConflictException {
  return new ConflictException({ message, code });
}

/**
 * Marketing → Destaques, do lado do painel — e o que a página pública recebe.
 *
 * Toda rota do painel resolve a empresa pelo login (`resolveCompanyId`) e filtra
 * por ela: uma loja só enxerga e mexe nos destaques dela. O `id` que vem da URL
 * nunca basta sozinho — é sempre procurado JUNTO da empresa, e o que é de outra
 * responde "não encontrado", sem confirmar que existe.
 */
@Injectable()
export class StoreHighlightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
  ) {}

  async highlights(user: User): Promise<DestaqueDaLoja[]> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    return this.listar(companyId);
  }

  async createHighlight(user: User, payload: StoreHighlightPayload): Promise<DestaqueDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.conferirLimite(companyId);
    await this.conferirProdutos(companyId, payload.produtoIds);
    const linha = await this.prisma.storeHighlight.create({
      data: { companyId, ...this.dados(payload), position: await this.proximaPosicao(companyId) },
    });
    return paraALoja(linha);
  }

  async updateHighlight(
    user: User,
    id: string,
    payload: StoreHighlightPayload,
  ): Promise<DestaqueDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.daEmpresa(companyId, id);
    await this.conferirProdutos(companyId, payload.produtoIds);
    // `updateMany` com a empresa na condição: a segunda defesa, se o `id` de outra
    // loja algum dia passar pela leitura acima. A posição fica onde estava.
    const { count } = await this.prisma.storeHighlight.updateMany({
      where: { id, companyId },
      data: this.dados(payload),
    });
    if (count !== 1) throw naoAchado();
    return paraALoja(await this.daEmpresa(companyId, id));
  }

  async setHighlightActive(user: User, id: string, ativo: boolean): Promise<DestaqueDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storeHighlight.updateMany({
      where: { id, companyId },
      data: { active: ativo },
    });
    if (count !== 1) throw naoAchado();
    return paraALoja(await this.daEmpresa(companyId, id));
  }

  async deleteHighlight(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const { count } = await this.prisma.storeHighlight.deleteMany({ where: { id, companyId } });
    if (count !== 1) throw naoAchado();
    return { deleted: true };
  }

  /** Copia o destaque, desligado e no fim da fila: quem duplica vai mudar algo antes de ligar. */
  async duplicateHighlight(user: User, id: string): Promise<DestaqueDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const original = await this.daEmpresa(companyId, id);
    await this.conferirLimite(companyId);
    const linha = await this.prisma.storeHighlight.create({
      data: {
        companyId,
        title: `${original.title.slice(0, 32)} (cópia)`,
        productIds: original.productIds,
        startDate: original.startDate,
        endDate: original.endDate,
        active: false,
        position: await this.proximaPosicao(companyId),
      },
    });
    return paraALoja(linha);
  }

  /**
   * A ordem nova dos destaques. Precisa trazer os ids de TODOS os destaques da
   * loja, nem a mais nem a menos: uma lista velha (outra aba criou ou apagou um)
   * é recusada, e a tela se relê — em vez de desfazer o que a outra aba fez.
   */
  async reorderHighlights(user: User, ids: string[]): Promise<DestaqueDaLoja[]> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const existentes = await this.prisma.storeHighlight.findMany({
      where: { companyId },
      select: { id: true },
    });
    const daLoja = new Set(existentes.map((item) => item.id));
    if (daLoja.size !== ids.length || ids.some((id) => !daLoja.has(id))) {
      throw recusa(
        'STORE_HIGHLIGHT_ORDER_STALE',
        'Os destaques mudaram em outra tela. A lista foi atualizada: mova de novo.',
      );
    }
    await this.prisma.$transaction(
      ids.map((id, indice) =>
        this.prisma.storeHighlight.updateMany({
          where: { id, companyId },
          data: { position: indice },
        }),
      ),
    );
    return this.listar(companyId);
  }

  /**
   * Os destaques que a página do cliente recebe: ligados, na ordem da loja, sem os
   * que já acabaram. A página ainda filtra por data com a hora dela e pelos
   * produtos que estão à venda.
   */
  async destaquesPublicos(companyId: string, agora = new Date()): Promise<DestaquePublico[]> {
    const hoje = momentoNaLoja(agora).data;
    const linhas = await this.prisma.storeHighlight.findMany({
      where: { companyId, active: true },
      orderBy: ORDEM,
    });
    return linhas
      .filter((linha) => linha.endDate === null || linha.endDate >= hoje)
      .map(paraPublico);
  }

  private async listar(companyId: string): Promise<DestaqueDaLoja[]> {
    const linhas = await this.prisma.storeHighlight.findMany({
      where: { companyId },
      orderBy: ORDEM,
    });
    return linhas.map(paraALoja);
  }

  private async daEmpresa(companyId: string, id: string): Promise<StoreHighlight> {
    const linha = await this.prisma.storeHighlight.findFirst({ where: { id, companyId } });
    if (!linha) throw naoAchado();
    return linha;
  }

  private async conferirLimite(companyId: string): Promise<void> {
    const total = await this.prisma.storeHighlight.count({ where: { companyId } });
    if (total >= MAXIMO_DE_DESTAQUES) {
      throw recusa(
        'STORE_HIGHLIGHT_LIMIT',
        `Você já tem ${MAXIMO_DE_DESTAQUES} destaques, que é o máximo. Apague ou edite um deles.`,
      );
    }
  }

  private async proximaPosicao(companyId: string): Promise<number> {
    const ultimo = await this.prisma.storeHighlight.aggregate({
      where: { companyId },
      _max: { position: true },
    });
    return (ultimo._max.position ?? -1) + 1;
  }

  /**
   * Os produtos têm de ser DESTA empresa: os ids chegam do navegador, e um
   * destaque com o produto de outra loja o mostraria no cardápio errado — e
   * revelaria que o id existe.
   */
  private async conferirProdutos(companyId: string, ids: string[]): Promise<void> {
    const achados = await this.prisma.storeProduct.count({ where: { id: { in: ids }, companyId } });
    if (achados !== ids.length) {
      throw recusa(
        'STORE_HIGHLIGHT_PRODUCT_NOT_FOUND',
        'Um dos produtos escolhidos não existe mais. Atualize a lista e escolha de novo.',
      );
    }
  }

  private dados(payload: StoreHighlightPayload) {
    return {
      title: payload.titulo,
      productIds: payload.produtoIds,
      startDate: payload.inicio,
      endDate: payload.fim,
      active: payload.ativo,
    };
  }
}
