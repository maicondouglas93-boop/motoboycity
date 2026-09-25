import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  PublicStoreProduct,
  StoreCatalog,
  StoreCategory,
  StoreProduct,
} from '@motoboycity/types';
import {
  storeProductIssues,
  type ReorderStoreCategoriesPayload,
  type ReorderStoreProductsPayload,
  type StoreCategoryNamePayload,
  type StoreProductForIssues,
  type StoreProductStatusValue,
  type UpsertStoreProductPayload,
} from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { ImageKitService } from '../../media/imagekit.service';
import { detectSupportedImage, type UploadedImageFile } from '../../media/supported-image';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * O catálogo da loja online, do lado do painel da empresa.
 *
 * Tudo é da empresa do usuário: toda leitura e toda escrita filtra por
 * `companyId`, e id de outra empresa responde como se não existisse.
 *
 * A ordem é guardada em `position`, mas o contrato fala em listas. Quem
 * reordena manda a lista inteira; o servidor confere que ela é exatamente a
 * atual — nem um item a mais, nem um a menos — e renumera numa transação. Uma
 * lista desatualizada (outra aba mexeu) é recusada, em vez de embaralhar o
 * cardápio.
 */

const PRODUTO_COMPLETO = {
  sizes: { orderBy: { position: 'asc' } },
  optionGroups: {
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.StoreProductInclude;

type ProdutoGravado = Prisma.StoreProductGetPayload<{ include: typeof PRODUTO_COMPLETO }>;

const ORDEM: Prisma.StoreCategoryOrderByWithRelationInput[] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

function paraProduto(linha: ProdutoGravado): StoreProduct {
  return {
    id: linha.id,
    categoryId: linha.categoryId,
    name: linha.name,
    description: linha.description,
    imageUrl: linha.imageUrl,
    price: linha.price === null ? null : Number(linha.price),
    status: linha.status,
    sizes: linha.sizes.map((tamanho) => ({
      id: tamanho.id,
      name: tamanho.name,
      price: Number(tamanho.price),
      available: tamanho.available,
    })),
    optionGroups: linha.optionGroups.map((grupo) => ({
      id: grupo.id,
      name: grupo.name,
      minChoices: grupo.minChoices,
      maxChoices: grupo.maxChoices,
      options: grupo.options.map((escolha) => ({
        id: escolha.id,
        name: escolha.name,
        price: Number(escolha.price),
        available: escolha.available,
      })),
    })),
    updatedAt: linha.updatedAt.toISOString(),
  };
}

/** Com tamanhos, o preço vem deles: o preço único é descartado, e não guardado à toa. */
function precoUnico(payload: UpsertStoreProductPayload): number | null {
  return payload.sizes.length > 0 ? null : payload.price;
}

function mesmoConjunto(atuais: readonly string[], enviados: readonly string[]): boolean {
  if (atuais.length !== enviados.length) return false;
  const conjunto = new Set(atuais);
  return enviados.every((id) => conjunto.has(id));
}

function listaDesatualizada(qual: string): ConflictException {
  return new ConflictException({
    message: `A lista de ${qual} mudou enquanto você mexia. Recarregue e tente de novo.`,
    code: 'STORE_CATALOG_STALE',
  });
}

@Injectable()
export class StoreCatalogService {
  private readonly logger = new Logger(StoreCatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageKit: ImageKitService,
  ) {}

  async resolveCompanyId(user: User): Promise<string> {
    if (user.type !== 'COMPANY_MEMBER') {
      throw new ForbiddenException('Acesso restrito a empresas.');
    }
    const membership = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membership) {
      throw new ForbiddenException('Usuario nao esta vinculado a uma empresa ativa.');
    }
    return membership.companyId;
  }

  /** O catálogo inteiro, na ordem do cardápio; os sem categoria por último. */
  async catalog(user: User): Promise<StoreCatalog> {
    const companyId = await this.resolveCompanyId(user);
    const [categorias, produtos] = await Promise.all([
      this.prisma.storeCategory.findMany({ where: { companyId }, orderBy: ORDEM }),
      this.prisma.storeProduct.findMany({
        where: { companyId },
        include: PRODUTO_COMPLETO,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const ordemDaCategoria = new Map(categorias.map((categoria, indice) => [categoria.id, indice]));
    const ordemDe = (produto: ProdutoGravado) =>
      produto.categoryId === null
        ? categorias.length
        : (ordemDaCategoria.get(produto.categoryId) ?? categorias.length);
    // `sort` é estável: dentro da mesma categoria vale a ordem da consulta.
    const ordenados = [...produtos].sort((a, b) => ordemDe(a) - ordemDe(b));

    return {
      categories: categorias.map(({ id, name }) => ({ id, name })),
      products: ordenados.map(paraProduto),
    };
  }

  /**
   * O cardápio que o cliente vê: só o que dá para comprar, e só as seções com
   * algo à venda, na ordem da loja.
   *
   * Publicado já é comprável — o servidor recusa publicar o que não é —, mas a
   * regra pode ficar mais exigente depois de o produto ir ao ar, e aí ele sai
   * daqui antes de alguém tentar pedir. Sem empresa no parâmetro de fora: quem
   * chama já resolveu a loja pelo link.
   */
  async publicCatalog(
    companyId: string,
  ): Promise<{ categories: StoreCategory[]; products: PublicStoreProduct[] }> {
    const [categorias, produtos] = await Promise.all([
      this.prisma.storeCategory.findMany({ where: { companyId }, orderBy: ORDEM }),
      this.prisma.storeProduct.findMany({
        where: { companyId, status: 'PUBLISHED', categoryId: { not: null } },
        include: PRODUTO_COMPLETO,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const ordemDaCategoria = new Map(categorias.map((categoria, indice) => [categoria.id, indice]));
    const vendaveis = produtos
      .map(paraProduto)
      .filter((produto) => !storeProductIssues(produto).some((pendencia) => pendencia.blocking))
      .sort(
        (a, b) =>
          (ordemDaCategoria.get(a.categoryId ?? '') ?? categorias.length) -
          (ordemDaCategoria.get(b.categoryId ?? '') ?? categorias.length),
      );
    const comProduto = new Set(vendaveis.map((produto) => produto.categoryId));

    return {
      categories: categorias
        .filter((categoria) => comProduto.has(categoria.id))
        .map(({ id, name }) => ({ id, name })),
      products: vendaveis.map(({ status: _status, updatedAt: _editado, ...publico }) => publico),
    };
  }

  /** Categoria nova entra no fim do cardápio. */
  async createCategory(user: User, payload: StoreCategoryNamePayload): Promise<StoreCategory> {
    const companyId = await this.resolveCompanyId(user);
    const ultima = await this.prisma.storeCategory.aggregate({
      where: { companyId },
      _max: { position: true },
    });
    const criada = await this.prisma.storeCategory.create({
      data: { companyId, name: payload.name, position: (ultima._max.position ?? -1) + 1 },
    });
    return { id: criada.id, name: criada.name };
  }

  async renameCategory(
    user: User,
    id: string,
    payload: StoreCategoryNamePayload,
  ): Promise<StoreCategory> {
    const companyId = await this.resolveCompanyId(user);
    await this.categoriaDaEmpresa(companyId, id);
    const salva = await this.prisma.storeCategory.update({
      where: { id },
      data: { name: payload.name },
    });
    return { id: salva.id, name: salva.name };
  }

  /**
   * Categoria com produto não sai: os produtos ficariam sem seção e sumiriam
   * da loja sem ninguém perceber. A tela já trava o botão; aqui é a regra, e a
   * restrição no banco segura até o produto que entrar no meio do caminho.
   */
  async deleteCategory(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.resolveCompanyId(user);
    await this.categoriaDaEmpresa(companyId, id);

    const naoVazia = () =>
      new ConflictException({
        message: 'Mova os produtos para outra categoria antes de excluir.',
        code: 'STORE_CATEGORY_NOT_EMPTY',
      });

    const produtos = await this.prisma.storeProduct.count({ where: { categoryId: id } });
    if (produtos > 0) throw naoVazia();

    try {
      await this.prisma.storeCategory.delete({ where: { id } });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2003') {
        throw naoVazia();
      }
      throw erro;
    }
    return { deleted: true };
  }

  async reorderCategories(
    user: User,
    payload: ReorderStoreCategoriesPayload,
  ): Promise<StoreCategory[]> {
    const companyId = await this.resolveCompanyId(user);
    const atuais = await this.prisma.storeCategory.findMany({
      where: { companyId },
      select: { id: true },
    });
    if (
      !mesmoConjunto(
        atuais.map((categoria) => categoria.id),
        payload.ids,
      )
    ) {
      throw listaDesatualizada('categorias');
    }

    await this.prisma.$transaction(
      payload.ids.map((id, position) =>
        this.prisma.storeCategory.update({ where: { id }, data: { position } }),
      ),
    );

    const ordenadas = await this.prisma.storeCategory.findMany({
      where: { companyId },
      orderBy: ORDEM,
    });
    return ordenadas.map(({ id, name }) => ({ id, name }));
  }

  /** Produto novo entra no fim da categoria dele. */
  async createProduct(user: User, payload: UpsertStoreProductPayload): Promise<StoreProduct> {
    const companyId = await this.resolveCompanyId(user);
    await this.assertCategoria(companyId, payload.categoryId);
    this.assertPublicavel(payload.status, {
      ...payload,
      imageUrl: null,
      price: precoUnico(payload),
    });
    const position = await this.proximaPosicao(companyId, payload.categoryId);

    const criado = await this.prisma.storeProduct.create({
      data: {
        companyId,
        categoryId: payload.categoryId,
        name: payload.name,
        description: payload.description,
        price: precoUnico(payload),
        status: payload.status,
        position,
        sizes: {
          create: payload.sizes.map((tamanho, indice) => ({
            name: tamanho.name,
            price: tamanho.price,
            available: tamanho.available,
            position: indice,
          })),
        },
        optionGroups: {
          create: payload.optionGroups.map((grupo, indice) => ({
            name: grupo.name,
            minChoices: grupo.minChoices,
            maxChoices: grupo.maxChoices,
            position: indice,
            options: {
              create: grupo.options.map((escolha, posicao) => ({
                name: escolha.name,
                price: escolha.price,
                available: escolha.available,
                position: posicao,
              })),
            },
          })),
        },
      },
      include: PRODUTO_COMPLETO,
    });
    return paraProduto(criado);
  }

  /**
   * Edita o produto e os itens dele numa transação só.
   *
   * Item com `id` é mantido — e o id não muda, para uma sacola montada antes
   * da edição continuar apontando para a escolha certa. Item sem `id` é novo;
   * item que sumiu da lista é apagado. Um `id` que não é deste produto (ou uma
   * escolha que mudou de grupo) é formulário desatualizado, e é recusado.
   *
   * Mudar de categoria põe o produto no fim da categoria nova.
   */
  async updateProduct(
    user: User,
    id: string,
    payload: UpsertStoreProductPayload,
  ): Promise<StoreProduct> {
    const companyId = await this.resolveCompanyId(user);
    const atual = await this.produtoDaEmpresa(companyId, id);
    await this.assertCategoria(companyId, payload.categoryId);
    this.assertPublicavel(payload.status, {
      ...payload,
      imageUrl: atual.imageUrl,
      price: precoUnico(payload),
    });
    this.assertItensDoProduto(atual, payload);

    const position =
      atual.categoryId === payload.categoryId
        ? atual.position
        : await this.proximaPosicao(companyId, payload.categoryId);

    const salvo = await this.prisma.$transaction(
      async (tx) => {
        const manterTamanhos = payload.sizes.flatMap((tamanho) => (tamanho.id ? [tamanho.id] : []));
        await tx.storeProductSize.deleteMany({
          where: { productId: id, id: { notIn: manterTamanhos } },
        });
        for (const [indice, tamanho] of payload.sizes.entries()) {
          const dados = {
            name: tamanho.name,
            price: tamanho.price,
            available: tamanho.available,
            position: indice,
          };
          if (tamanho.id) {
            await tx.storeProductSize.update({ where: { id: tamanho.id }, data: dados });
          } else {
            await tx.storeProductSize.create({ data: { ...dados, productId: id } });
          }
        }

        const manterGrupos = payload.optionGroups.flatMap((grupo) => (grupo.id ? [grupo.id] : []));
        // Apagar o grupo leva as escolhas dele junto (cascade).
        await tx.storeOptionGroup.deleteMany({
          where: { productId: id, id: { notIn: manterGrupos } },
        });
        for (const [indice, grupo] of payload.optionGroups.entries()) {
          const dados = {
            name: grupo.name,
            minChoices: grupo.minChoices,
            maxChoices: grupo.maxChoices,
            position: indice,
          };
          const grupoId = grupo.id
            ? (await tx.storeOptionGroup.update({ where: { id: grupo.id }, data: dados })).id
            : (await tx.storeOptionGroup.create({ data: { ...dados, productId: id } })).id;

          const manterEscolhas = grupo.options.flatMap((escolha) =>
            escolha.id ? [escolha.id] : [],
          );
          await tx.storeOption.deleteMany({
            where: { groupId: grupoId, id: { notIn: manterEscolhas } },
          });
          for (const [posicao, escolha] of grupo.options.entries()) {
            const dadosDaEscolha = {
              name: escolha.name,
              price: escolha.price,
              available: escolha.available,
              position: posicao,
            };
            if (escolha.id) {
              await tx.storeOption.update({ where: { id: escolha.id }, data: dadosDaEscolha });
            } else {
              await tx.storeOption.create({ data: { ...dadosDaEscolha, groupId: grupoId } });
            }
          }
        }

        return tx.storeProduct.update({
          where: { id },
          data: {
            categoryId: payload.categoryId,
            name: payload.name,
            description: payload.description,
            price: precoUnico(payload),
            status: payload.status,
            position,
          },
          include: PRODUTO_COMPLETO,
        });
        // Um produto cheio de adicionais faz dezenas de escritas em sequência; os
        // 5 s padrão do Prisma ficariam apertados com o banco longe da API.
      },
      { timeout: 15_000 },
    );

    return paraProduto(salvo);
  }

  /** Pausar e voltar a rascunho sempre podem; publicar exige o produto comprável. */
  async updateProductStatus(
    user: User,
    id: string,
    status: StoreProductStatusValue,
  ): Promise<StoreProduct> {
    const companyId = await this.resolveCompanyId(user);
    const atual = await this.produtoDaEmpresa(companyId, id);
    this.assertPublicavel(status, paraProduto(atual));
    const salvo = await this.prisma.storeProduct.update({
      where: { id },
      data: { status },
      include: PRODUTO_COMPLETO,
    });
    return paraProduto(salvo);
  }

  /** Os itens saem junto, pelo banco; a foto sai do ImageKit depois. */
  async deleteProduct(user: User, id: string): Promise<{ deleted: true }> {
    const companyId = await this.resolveCompanyId(user);
    const atual = await this.produtoDaEmpresa(companyId, id);
    await this.prisma.storeProduct.delete({ where: { id } });
    if (atual.imageExternalFileId) {
      await this.apagarFotoSemQuebrar(atual.imageExternalFileId, 'foto de produto excluído');
    }
    return { deleted: true };
  }

  /**
   * Põe ou troca a foto do produto.
   *
   * O arquivo sobe antes, e o produto troca de foto só se a foto dele ainda for
   * a que foi lida — um envio que chegue no meio (outra aba) faz esta tentativa
   * reler, em vez de um apagar a foto que o outro acabou de pôr. A foto que
   * saiu é apagada do ImageKit depois de gravado; a que subiu e não foi usada,
   * também.
   */
  async setProductImage(user: User, id: string, file: UploadedImageFile): Promise<StoreProduct> {
    const companyId = await this.resolveCompanyId(user);
    await this.produtoDaEmpresa(companyId, id);
    const imagem = detectSupportedImage(file);
    const enviada = await this.imageKit.uploadStoreProductImage({
      companyId,
      productId: id,
      buffer: file.buffer,
      extension: imagem.extension,
    });

    try {
      const anterior = await this.trocarFoto(companyId, id, {
        imageUrl: enviada.url,
        imageExternalFileId: enviada.externalFileId,
      });
      if (anterior && anterior !== enviada.externalFileId) {
        await this.apagarFotoSemQuebrar(anterior, 'foto substituída');
      }
    } catch (erro) {
      await this.apagarFotoSemQuebrar(enviada.externalFileId, 'foto nova depois de falha');
      throw erro;
    }
    return paraProduto(await this.produtoDaEmpresa(companyId, id));
  }

  /** Tirar a foto de quem não tem foto não é erro: dois toques, ou duas abas. */
  async removeProductImage(user: User, id: string): Promise<StoreProduct> {
    const companyId = await this.resolveCompanyId(user);
    await this.produtoDaEmpresa(companyId, id);
    const anterior = await this.trocarFoto(companyId, id, {
      imageUrl: null,
      imageExternalFileId: null,
    });
    if (anterior) await this.apagarFotoSemQuebrar(anterior, 'foto removida');
    return paraProduto(await this.produtoDaEmpresa(companyId, id));
  }

  async reorderProducts(user: User, payload: ReorderStoreProductsPayload): Promise<StoreProduct[]> {
    const companyId = await this.resolveCompanyId(user);
    await this.assertCategoria(companyId, payload.categoryId);
    const onde = { companyId, categoryId: payload.categoryId };

    const atuais = await this.prisma.storeProduct.findMany({ where: onde, select: { id: true } });
    if (
      !mesmoConjunto(
        atuais.map((produto) => produto.id),
        payload.ids,
      )
    ) {
      throw listaDesatualizada('produtos');
    }

    await this.prisma.$transaction(
      payload.ids.map((id, position) =>
        this.prisma.storeProduct.update({ where: { id }, data: { position } }),
      ),
    );

    const ordenados = await this.prisma.storeProduct.findMany({
      where: onde,
      include: PRODUTO_COMPLETO,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return ordenados.map(paraProduto);
  }

  private async categoriaDaEmpresa(companyId: string, id: string): Promise<void> {
    const categoria = await this.prisma.storeCategory.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!categoria) throw new NotFoundException('Categoria não encontrada.');
  }

  /**
   * Troca a foto só se ela ainda for a que foi lida, e devolve o arquivo que
   * saiu. Três tentativas: mais que isso é alguém trocando a foto sem parar.
   */
  private async trocarFoto(
    companyId: string,
    id: string,
    foto: { imageUrl: string | null; imageExternalFileId: string | null },
  ): Promise<string | null> {
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      const atual = await this.prisma.storeProduct.findFirst({
        where: { id, companyId },
        select: { imageExternalFileId: true },
      });
      if (!atual) throw new NotFoundException('Produto não encontrado.');
      const { count } = await this.prisma.storeProduct.updateMany({
        where: { id, companyId, imageExternalFileId: atual.imageExternalFileId },
        data: foto,
      });
      if (count === 1) return atual.imageExternalFileId;
    }
    throw new ConflictException({
      message: 'A foto mudou enquanto você enviava. Tente de novo.',
      code: 'STORE_PRODUCT_STALE',
    });
  }

  private async apagarFotoSemQuebrar(externalFileId: string, contexto: string): Promise<void> {
    try {
      await this.imageKit.delete(externalFileId);
    } catch {
      this.logger.warn(`Nao foi possivel remover ${contexto} do ImageKit.`);
    }
  }

  private async produtoDaEmpresa(companyId: string, id: string): Promise<ProdutoGravado> {
    const produto = await this.prisma.storeProduct.findFirst({
      where: { id, companyId },
      include: PRODUTO_COMPLETO,
    });
    if (!produto) throw new NotFoundException('Produto não encontrado.');
    return produto;
  }

  /** A categoria escolhida tem de ser desta empresa — ou nenhuma. */
  private async assertCategoria(companyId: string, categoryId: string | null): Promise<void> {
    if (categoryId === null) return;
    const categoria = await this.prisma.storeCategory.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    });
    if (!categoria) {
      throw new BadRequestException({
        message: 'Categoria não encontrada.',
        issues: [{ path: 'categoryId', message: 'Categoria não encontrada.' }],
      });
    }
  }

  /**
   * Publicado tem de ser comprável. É a mesma lista de pendências que o painel
   * mostra (`storeProductIssues`), e por isso a tela e o servidor nunca
   * discordam sobre o que dá para publicar.
   */
  private assertPublicavel(status: StoreProductStatusValue, produto: StoreProductForIssues): void {
    if (status !== 'PUBLISHED') return;
    const bloqueios = storeProductIssues(produto).filter((pendencia) => pendencia.blocking);
    if (bloqueios.length === 0) return;
    throw new BadRequestException({
      message: `Não dá para publicar: ${bloqueios.map((pendencia) => pendencia.text).join('; ')}.`,
      code: 'STORE_PRODUCT_NOT_PUBLISHABLE',
      issues: bloqueios.map((pendencia) => ({ path: 'status', message: pendencia.text })),
    });
  }

  private assertItensDoProduto(atual: ProdutoGravado, payload: UpsertStoreProductPayload): void {
    const tamanhos = new Set(atual.sizes.map((tamanho) => tamanho.id));
    const grupos = new Map(
      atual.optionGroups.map((grupo) => [
        grupo.id,
        new Set(grupo.options.map((escolha) => escolha.id)),
      ]),
    );

    const tamanhoEstranho = payload.sizes.some(
      (tamanho) => tamanho.id !== undefined && !tamanhos.has(tamanho.id),
    );
    const grupoEstranho = payload.optionGroups.some((grupo) => {
      if (grupo.id === undefined) {
        // Grupo novo só tem escolhas novas: escolha não muda de grupo.
        return grupo.options.some((escolha) => escolha.id !== undefined);
      }
      const escolhas = grupos.get(grupo.id);
      if (!escolhas) return true;
      return grupo.options.some((escolha) => escolha.id !== undefined && !escolhas.has(escolha.id));
    });

    if (tamanhoEstranho || grupoEstranho) {
      throw new ConflictException({
        message: 'O produto mudou enquanto você editava. Recarregue e tente de novo.',
        code: 'STORE_PRODUCT_STALE',
      });
    }
  }

  private async proximaPosicao(companyId: string, categoryId: string | null): Promise<number> {
    const ultima = await this.prisma.storeProduct.aggregate({
      where: { companyId, categoryId },
      _max: { position: true },
    });
    return (ultima._max.position ?? -1) + 1;
  }
}
