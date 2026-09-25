import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { storeProductIssues, type UpsertStoreProductPayload } from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { ImageKitService } from '../../media/imagekit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from './store-catalog.service';

const EMPRESA = 'empresa-1';
const CATEGORIA_A = '0b7a3a52-1111-4a2e-9d7e-000000000001';
const CATEGORIA_B = '0b7a3a52-1111-4a2e-9d7e-000000000002';
const PRODUTO = '0b7a3a52-2222-4a2e-9d7e-000000000001';
const TAMANHO = '0b7a3a52-3333-4a2e-9d7e-000000000001';
const GRUPO = '0b7a3a52-4444-4a2e-9d7e-000000000001';
const ESCOLHA = '0b7a3a52-5555-4a2e-9d7e-000000000001';

const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

function produtoGravado(mudancas: Record<string, unknown> = {}) {
  return {
    id: PRODUTO,
    companyId: EMPRESA,
    categoryId: CATEGORIA_A,
    name: 'Açaí',
    description: 'Cremoso, batido na hora.',
    imageUrl: null,
    imageExternalFileId: null,
    price: null,
    status: 'DRAFT',
    position: 0,
    createdAt: new Date('2026-09-25T09:00:00Z'),
    updatedAt: new Date('2026-09-25T10:00:00Z'),
    sizes: [
      {
        id: TAMANHO,
        productId: PRODUTO,
        name: '500ml',
        price: new Prisma.Decimal('18'),
        available: true,
        position: 0,
      },
    ],
    optionGroups: [
      {
        id: GRUPO,
        productId: PRODUTO,
        name: 'Adicionais',
        minChoices: 0,
        maxChoices: null,
        position: 0,
        options: [
          {
            id: ESCOLHA,
            groupId: GRUPO,
            name: 'Morango',
            price: new Prisma.Decimal('3'),
            available: true,
            position: 0,
          },
        ],
      },
    ],
    ...mudancas,
  };
}

function payload(mudancas: Partial<UpsertStoreProductPayload> = {}): UpsertStoreProductPayload {
  return {
    categoryId: CATEGORIA_A,
    name: 'Açaí',
    description: 'Cremoso, batido na hora.',
    price: null,
    status: 'DRAFT',
    sizes: [{ id: TAMANHO, name: '500ml', price: 18, available: true }],
    optionGroups: [
      {
        id: GRUPO,
        name: 'Adicionais',
        minChoices: 0,
        maxChoices: null,
        options: [{ id: ESCOLHA, name: 'Morango', price: 3, available: true }],
      },
    ],
    ...mudancas,
  };
}

describe('StoreCatalogService', () => {
  let service: StoreCatalogService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    storeCategory: Record<
      'findMany' | 'findFirst' | 'aggregate' | 'create' | 'update' | 'delete',
      jest.Mock
    >;
    storeProduct: Record<
      | 'findMany'
      | 'findFirst'
      | 'aggregate'
      | 'create'
      | 'update'
      | 'updateMany'
      | 'delete'
      | 'count',
      jest.Mock
    >;
    storeProductSize: Record<'deleteMany' | 'update' | 'create', jest.Mock>;
    storeOptionGroup: Record<'deleteMany' | 'update' | 'create', jest.Mock>;
    storeOption: Record<'deleteMany' | 'update' | 'create', jest.Mock>;
    $transaction: jest.Mock;
  };

  let imageKit: { uploadStoreProductImage: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    imageKit = {
      uploadStoreProductImage: jest.fn().mockResolvedValue({
        externalFileId: 'foto-nova',
        url: 'https://ik.imagekit.io/motoboycity/produto-nova.jpg',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const mocks = <K extends string>(...nomes: K[]) =>
      Object.fromEntries(nomes.map((nome) => [nome, jest.fn()])) as Record<K, jest.Mock>;
    prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: EMPRESA }) },
      storeCategory: mocks('findMany', 'findFirst', 'aggregate', 'create', 'update', 'delete'),
      storeProduct: mocks(
        'findMany',
        'findFirst',
        'aggregate',
        'create',
        'update',
        'updateMany',
        'delete',
        'count',
      ),
      storeProductSize: mocks('deleteMany', 'update', 'create'),
      storeOptionGroup: mocks('deleteMany', 'update', 'create'),
      storeOption: mocks('deleteMany', 'update', 'create'),
      $transaction: jest.fn(),
    };
    // Lista de operações: roda todas. Callback: o próprio mock faz de `tx`.
    prisma.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prisma) => unknown)(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreCatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: ImageKitService, useValue: imageKit },
      ],
    }).compile();
    service = module.get(StoreCatalogService);
  });

  describe('acesso', () => {
    it('recusa quem não é de empresa', async () => {
      await expect(service.catalog({ id: 'x', type: 'DRIVER' } as User)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('recusa membro sem vínculo ativo', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue(null);
      await expect(service.catalog(membro)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('catalog', () => {
    it('devolve o cardápio na ordem das categorias, os sem categoria por último, e dinheiro em número', async () => {
      prisma.storeCategory.findMany.mockResolvedValue([
        { id: CATEGORIA_A, name: 'Açaí', position: 0 },
        { id: CATEGORIA_B, name: 'Lanches', position: 1 },
      ]);
      prisma.storeProduct.findMany.mockResolvedValue([
        produtoGravado({ id: 'lanche', categoryId: CATEGORIA_B }),
        produtoGravado({ id: 'rascunho', categoryId: null }),
        produtoGravado({ id: 'acai', categoryId: CATEGORIA_A }),
      ]);

      const catalogo = await service.catalog(membro);

      expect(catalogo.categories).toEqual([
        { id: CATEGORIA_A, name: 'Açaí' },
        { id: CATEGORIA_B, name: 'Lanches' },
      ]);
      expect(catalogo.products.map((produto) => produto.id)).toEqual([
        'acai',
        'lanche',
        'rascunho',
      ]);
      expect(catalogo.products[0]?.sizes[0]?.price).toBe(18);
      expect(catalogo.products[0]?.optionGroups[0]?.options[0]?.price).toBe(3);
      expect(prisma.storeProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: EMPRESA } }),
      );
    });
  });

  describe('categorias', () => {
    it('categoria nova entra no fim do cardápio', async () => {
      prisma.storeCategory.aggregate.mockResolvedValue({ _max: { position: 2 } });
      prisma.storeCategory.create.mockResolvedValue({ id: CATEGORIA_B, name: 'Bebidas' });

      await service.createCategory(membro, { name: 'Bebidas' });

      expect(prisma.storeCategory.create).toHaveBeenCalledWith({
        data: { companyId: EMPRESA, name: 'Bebidas', position: 3 },
      });
    });

    it('a primeira categoria fica na posição zero', async () => {
      prisma.storeCategory.aggregate.mockResolvedValue({ _max: { position: null } });
      prisma.storeCategory.create.mockResolvedValue({ id: CATEGORIA_A, name: 'Açaí' });

      await service.createCategory(membro, { name: 'Açaí' });

      expect(prisma.storeCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
      );
    });

    it('categoria de outra empresa responde como se não existisse', async () => {
      prisma.storeCategory.findFirst.mockResolvedValue(null);
      await expect(
        service.renameCategory(membro, CATEGORIA_A, { name: 'Outro nome' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.storeCategory.update).not.toHaveBeenCalled();
    });

    it('categoria com produto não sai', async () => {
      prisma.storeCategory.findFirst.mockResolvedValue({ id: CATEGORIA_A });
      prisma.storeProduct.count.mockResolvedValue(2);

      await expect(service.deleteCategory(membro, CATEGORIA_A)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STORE_CATEGORY_NOT_EMPTY' }),
      });
      expect(prisma.storeCategory.delete).not.toHaveBeenCalled();
    });

    /*
     * O produto que entra entre a contagem e a exclusão: a restrição do banco
     * recusa, e a resposta é o mesmo aviso, e não um erro 500.
     */
    it('produto que chega no meio do caminho vira o mesmo aviso, e não erro do servidor', async () => {
      prisma.storeCategory.findFirst.mockResolvedValue({ id: CATEGORIA_A });
      prisma.storeProduct.count.mockResolvedValue(0);
      prisma.storeCategory.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('restrição', {
          code: 'P2003',
          clientVersion: 'teste',
        }),
      );

      await expect(service.deleteCategory(membro, CATEGORIA_A)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('recusa ordem desatualizada — faltando categoria — sem mexer em nada', async () => {
      prisma.storeCategory.findMany.mockResolvedValue([
        { id: CATEGORIA_A },
        { id: CATEGORIA_B },
        { id: 'terceira' },
      ]);

      await expect(
        service.reorderCategories(membro, { ids: [CATEGORIA_B, CATEGORIA_A] }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STORE_CATALOG_STALE' }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('renumera na ordem da lista, numa transação', async () => {
      prisma.storeCategory.findMany
        .mockResolvedValueOnce([{ id: CATEGORIA_A }, { id: CATEGORIA_B }])
        .mockResolvedValueOnce([
          { id: CATEGORIA_B, name: 'Lanches' },
          { id: CATEGORIA_A, name: 'Açaí' },
        ]);
      prisma.storeCategory.update.mockResolvedValue({});

      const ordem = await service.reorderCategories(membro, { ids: [CATEGORIA_B, CATEGORIA_A] });

      expect(prisma.storeCategory.update).toHaveBeenNthCalledWith(1, {
        where: { id: CATEGORIA_B },
        data: { position: 0 },
      });
      expect(prisma.storeCategory.update).toHaveBeenNthCalledWith(2, {
        where: { id: CATEGORIA_A },
        data: { position: 1 },
      });
      expect(ordem.map((categoria) => categoria.id)).toEqual([CATEGORIA_B, CATEGORIA_A]);
    });
  });

  describe('produtos', () => {
    beforeEach(() => {
      prisma.storeCategory.findFirst.mockResolvedValue({ id: CATEGORIA_A });
      prisma.storeProduct.aggregate.mockResolvedValue({ _max: { position: 4 } });
    });

    it('publicar sem categoria é recusado, com a pendência por extenso', async () => {
      const promessa = service.createProduct(
        membro,
        payload({ categoryId: null, status: 'PUBLISHED' }),
      );
      await expect(promessa).rejects.toBeInstanceOf(BadRequestException);
      await expect(promessa).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'STORE_PRODUCT_NOT_PUBLISHABLE',
          message: expect.stringContaining('sem categoria'),
        }),
      });
      expect(prisma.storeProduct.create).not.toHaveBeenCalled();
    });

    it('rascunho pode ficar sem categoria: salvar o trabalho pela metade é permitido', async () => {
      prisma.storeProduct.create.mockResolvedValue(produtoGravado({ categoryId: null }));
      await service.createProduct(membro, payload({ categoryId: null }));
      expect(prisma.storeProduct.create).toHaveBeenCalled();
    });

    it('produto novo entra no fim da categoria, com os itens na ordem da lista', async () => {
      prisma.storeProduct.create.mockResolvedValue(produtoGravado());

      await service.createProduct(
        membro,
        payload({
          price: 10,
          sizes: [
            { name: '300ml', price: 12, available: true },
            { name: '500ml', price: 18, available: true },
          ],
        }),
      );

      const dados = prisma.storeProduct.create.mock.calls[0][0].data;
      expect(dados.position).toBe(5);
      // Com tamanhos, o preço único é descartado.
      expect(dados.price).toBeNull();
      expect(dados.sizes.create).toEqual([
        { name: '300ml', price: 12, available: true, position: 0 },
        { name: '500ml', price: 18, available: true, position: 1 },
      ]);
    });

    it('categoria de outra empresa é recusada', async () => {
      prisma.storeCategory.findFirst.mockResolvedValue(null);
      await expect(service.createProduct(membro, payload())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('editar mantém os ids, cria os itens novos e apaga os que saíram', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(produtoGravado());
      prisma.storeOptionGroup.update.mockResolvedValue({ id: GRUPO });
      prisma.storeProduct.update.mockResolvedValue(produtoGravado());

      await service.updateProduct(
        membro,
        PRODUTO,
        payload({
          sizes: [
            { id: TAMANHO, name: '500ml', price: 19, available: true },
            { name: '700ml', price: 24, available: true },
          ],
        }),
      );

      expect(prisma.storeProductSize.deleteMany).toHaveBeenCalledWith({
        where: { productId: PRODUTO, id: { notIn: [TAMANHO] } },
      });
      expect(prisma.storeProductSize.update).toHaveBeenCalledWith({
        where: { id: TAMANHO },
        data: { name: '500ml', price: 19, available: true, position: 0 },
      });
      expect(prisma.storeProductSize.create).toHaveBeenCalledWith({
        data: { name: '700ml', price: 24, available: true, position: 1, productId: PRODUTO },
      });
      expect(prisma.storeOption.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ESCOLHA } }),
      );
    });

    it('item que não é deste produto é formulário desatualizado', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(produtoGravado());

      await expect(
        service.updateProduct(
          membro,
          PRODUTO,
          payload({ sizes: [{ id: 'de-outro-produto', name: 'X', price: 1, available: true }] }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'STORE_PRODUCT_STALE' }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('escolha não muda de grupo: grupo novo com escolha antiga é recusado', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(produtoGravado());

      await expect(
        service.updateProduct(
          membro,
          PRODUTO,
          payload({
            optionGroups: [
              {
                name: 'Coberturas',
                minChoices: 0,
                maxChoices: null,
                options: [{ id: ESCOLHA, name: 'Morango', price: 3, available: true }],
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('mudar de categoria põe o produto no fim da categoria nova', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(produtoGravado({ position: 0 }));
      prisma.storeOptionGroup.update.mockResolvedValue({ id: GRUPO });
      prisma.storeProduct.update.mockResolvedValue(produtoGravado({ categoryId: CATEGORIA_B }));

      await service.updateProduct(membro, PRODUTO, payload({ categoryId: CATEGORIA_B }));

      expect(prisma.storeProduct.aggregate).toHaveBeenCalledWith({
        where: { companyId: EMPRESA, categoryId: CATEGORIA_B },
        _max: { position: true },
      });
      expect(prisma.storeProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: CATEGORIA_B, position: 5 }),
        }),
      );
    });

    it('publicar com grupo obrigatório sem escolha disponível é recusado', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(
        produtoGravado({
          optionGroups: [
            {
              id: GRUPO,
              name: 'Ponto da carne',
              minChoices: 1,
              maxChoices: 1,
              position: 0,
              options: [
                {
                  id: ESCOLHA,
                  name: 'Ao ponto',
                  price: new Prisma.Decimal('0'),
                  available: false,
                  position: 0,
                },
              ],
            },
          ],
        }),
      );

      await expect(service.updateProductStatus(membro, PRODUTO, 'PUBLISHED')).rejects.toMatchObject(
        {
          response: expect.objectContaining({
            message: expect.stringContaining('"Ponto da carne" exige 1'),
          }),
        },
      );
      expect(prisma.storeProduct.update).not.toHaveBeenCalled();
    });

    it('pausar sempre pode, mesmo com pendência', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(produtoGravado({ categoryId: null }));
      prisma.storeProduct.update.mockResolvedValue(produtoGravado({ status: 'PAUSED' }));

      const produto = await service.updateProductStatus(membro, PRODUTO, 'PAUSED');

      expect(produto.status).toBe('PAUSED');
    });

    it('recusa ordem de produtos desatualizada', async () => {
      prisma.storeProduct.findMany.mockResolvedValue([{ id: PRODUTO }, { id: 'outro' }]);
      await expect(
        service.reorderProducts(membro, { categoryId: CATEGORIA_A, ids: [PRODUTO] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('salvar o produto não mexe na foto: ela tem rota própria', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(
        produtoGravado({ imageUrl: 'https://ik.imagekit.io/a.jpg', imageExternalFileId: 'foto-a' }),
      );
      prisma.storeOptionGroup.update.mockResolvedValue({ id: GRUPO });
      prisma.storeProduct.update.mockResolvedValue(produtoGravado());

      await service.updateProduct(membro, PRODUTO, payload());

      const dados = prisma.storeProduct.update.mock.calls[0]![0].data;
      expect(dados).not.toHaveProperty('imageUrl');
      expect(dados).not.toHaveProperty('imageExternalFileId');
    });

    it('excluir o produto apaga a foto do ImageKit', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(
        produtoGravado({ imageExternalFileId: 'foto-a' }),
      );
      prisma.storeProduct.delete.mockResolvedValue({});

      await service.deleteProduct(membro, PRODUTO);

      expect(imageKit.delete).toHaveBeenCalledWith('foto-a');
    });
  });

  describe('foto do produto', () => {
    // Um JPEG mínimo de 1 x 1: começo, quadro com as dimensões, e fim.
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    const arquivo = (buffer: Buffer) => ({
      buffer,
      size: buffer.length,
      mimetype: 'image/jpeg',
      originalname: 'foto.jpg',
    });

    it('troca a foto e apaga a anterior do ImageKit, depois de gravar', async () => {
      prisma.storeProduct.findFirst
        .mockResolvedValueOnce(produtoGravado({ imageExternalFileId: 'foto-antiga' }))
        .mockResolvedValueOnce({ imageExternalFileId: 'foto-antiga' })
        .mockResolvedValueOnce(
          produtoGravado({
            imageUrl: 'https://ik.imagekit.io/motoboycity/produto-nova.jpg',
            imageExternalFileId: 'foto-nova',
          }),
        );
      prisma.storeProduct.updateMany.mockResolvedValue({ count: 1 });

      const produto = await service.setProductImage(membro, PRODUTO, arquivo(jpeg));

      expect(imageKit.uploadStoreProductImage).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: EMPRESA, productId: PRODUTO, extension: 'jpg' }),
      );
      // Só troca se a foto ainda for a que foi lida.
      expect(prisma.storeProduct.updateMany).toHaveBeenCalledWith({
        where: { id: PRODUTO, companyId: EMPRESA, imageExternalFileId: 'foto-antiga' },
        data: {
          imageUrl: 'https://ik.imagekit.io/motoboycity/produto-nova.jpg',
          imageExternalFileId: 'foto-nova',
        },
      });
      expect(imageKit.delete).toHaveBeenCalledWith('foto-antiga');
      expect(produto.imageUrl).toBe('https://ik.imagekit.io/motoboycity/produto-nova.jpg');
      expect(produto).not.toHaveProperty('imageExternalFileId');
    });

    it('arquivo que não é imagem não chega ao ImageKit', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(produtoGravado());

      await expect(
        service.setProductImage(membro, PRODUTO, arquivo(Buffer.from('não sou imagem'))),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(imageKit.uploadStoreProductImage).not.toHaveBeenCalled();
    });

    it('produto de outra empresa responde como se não existisse, sem enviar nada', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(null);

      await expect(service.setProductImage(membro, PRODUTO, arquivo(jpeg))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(imageKit.uploadStoreProductImage).not.toHaveBeenCalled();
    });

    it('produto excluído enquanto a foto subia: a foto nova sai do ImageKit', async () => {
      prisma.storeProduct.findFirst
        .mockResolvedValueOnce(produtoGravado())
        .mockResolvedValueOnce(null);

      await expect(service.setProductImage(membro, PRODUTO, arquivo(jpeg))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(imageKit.delete).toHaveBeenCalledWith('foto-nova');
    });

    it('outra aba trocando a foto sem parar vira aviso, e a foto enviada não fica esquecida', async () => {
      prisma.storeProduct.findFirst
        .mockResolvedValueOnce(produtoGravado())
        .mockResolvedValue({ imageExternalFileId: 'foto-da-outra-aba' });
      prisma.storeProduct.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.setProductImage(membro, PRODUTO, arquivo(jpeg))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.storeProduct.updateMany).toHaveBeenCalledTimes(3);
      expect(imageKit.delete).toHaveBeenCalledWith('foto-nova');
      expect(imageKit.delete).not.toHaveBeenCalledWith('foto-da-outra-aba');
    });

    it('tirar a foto limpa o produto e apaga o arquivo; sem foto, não faz nada de mais', async () => {
      prisma.storeProduct.findFirst
        .mockResolvedValueOnce(produtoGravado({ imageExternalFileId: 'foto-a' }))
        .mockResolvedValueOnce({ imageExternalFileId: 'foto-a' })
        .mockResolvedValueOnce(produtoGravado());
      prisma.storeProduct.updateMany.mockResolvedValue({ count: 1 });

      await service.removeProductImage(membro, PRODUTO);

      expect(prisma.storeProduct.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { imageUrl: null, imageExternalFileId: null } }),
      );
      expect(imageKit.delete).toHaveBeenCalledWith('foto-a');

      imageKit.delete.mockClear();
      prisma.storeProduct.findFirst
        .mockResolvedValueOnce(produtoGravado())
        .mockResolvedValueOnce({ imageExternalFileId: null })
        .mockResolvedValueOnce(produtoGravado());
      await service.removeProductImage(membro, PRODUTO);
      expect(imageKit.delete).not.toHaveBeenCalled();
    });
  });
});

/**
 * As regras de "dá para publicar?" moram no pacote de validação para o painel
 * e o servidor nunca discordarem. Aqui, os casos que decidem venda.
 */
describe('storeProductIssues', () => {
  const base = {
    categoryId: CATEGORIA_A,
    name: 'X-Salada',
    description: 'Pão, hambúrguer e salada.',
    imageUrl: 'https://exemplo.com/foto.jpg',
    price: 24,
    sizes: [],
    optionGroups: [],
  };

  it('produto completo não tem pendência', () => {
    expect(storeProductIssues(base)).toEqual([]);
  });

  it('todos os tamanhos indisponíveis impede vender, como se não houvesse preço', () => {
    const issues = storeProductIssues({
      ...base,
      price: null,
      sizes: [{ name: '500ml', price: 18, available: false }],
    });
    expect(issues).toContainEqual({
      text: 'nenhum tamanho disponível — o cliente não consegue escolher',
      blocking: true,
    });
  });

  it('sem foto e sem descrição avisam, mas não impedem vender', () => {
    const issues = storeProductIssues({ ...base, imageUrl: null, description: '' });
    expect(issues.every((issue) => !issue.blocking)).toBe(true);
    expect(issues).toHaveLength(2);
  });
});
