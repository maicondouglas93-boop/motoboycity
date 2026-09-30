import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { UpsertStoreProductPayload } from '@motoboycity/validation';
import { Prisma, type User } from '@prisma/client';
import { ImageKitService } from '../../media/imagekit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from './store-catalog.service';

/**
 * O combo no catálogo: o que a loja pode gravar, o que impede de publicar, e o que o cliente vê.
 * O combo é um produto de tipo `COMBO`, com os itens que leva; o preço é o dele.
 */

const EMPRESA = 'empresa-1';
const CATEGORIA = '0b7a3a52-1111-4a2e-9d7e-000000000001';
const COMBO = '0b7a3a52-2222-4a2e-9d7e-0000000000c0';
const BURGER = '0b7a3a52-2222-4a2e-9d7e-000000000001';
const BATATA = '0b7a3a52-2222-4a2e-9d7e-000000000002';
const TAM_M = '0b7a3a52-3333-4a2e-9d7e-000000000001';
const TAM_G = '0b7a3a52-3333-4a2e-9d7e-000000000002';
const GRUPO = '0b7a3a52-4444-4a2e-9d7e-000000000001';

const membro = { id: 'user-1', type: 'COMPANY_MEMBER' } as User;

function linhaDeProduto(mudancas: Record<string, unknown> = {}) {
  return {
    id: BURGER,
    companyId: EMPRESA,
    categoryId: CATEGORIA,
    kind: 'PRODUCT',
    name: 'X-Burger',
    description: 'Pão, carne e queijo',
    imageUrl: 'https://ik.imagekit.io/burger.jpg',
    imageExternalFileId: null,
    price: new Prisma.Decimal('22'),
    status: 'PUBLISHED',
    stock: null,
    position: 0,
    createdAt: new Date('2026-09-25T09:00:00Z'),
    updatedAt: new Date('2026-09-25T10:00:00Z'),
    comboItems: [],
    sizes: [],
    optionGroups: [],
    ...mudancas,
  };
}

/** A batata em dois tamanhos; a média pode ter acabado. */
function batata(mediaDisponivel = true) {
  return linhaDeProduto({
    id: BATATA,
    name: 'Batata',
    price: null,
    sizes: [
      {
        id: TAM_M,
        productId: BATATA,
        name: 'Média',
        price: new Prisma.Decimal('12'),
        available: mediaDisponivel,
        position: 0,
      },
      {
        id: TAM_G,
        productId: BATATA,
        name: 'Grande',
        price: new Prisma.Decimal('16'),
        available: true,
        position: 1,
      },
    ],
  });
}
const BATATA_GRAVADA = batata();

function combo(mudancas: Record<string, unknown> = {}) {
  return linhaDeProduto({
    id: COMBO,
    kind: 'COMBO',
    name: 'Combo X-Burger',
    price: new Prisma.Decimal('30'),
    comboItems: [
      { id: 'i1', comboId: COMBO, productId: BURGER, sizeId: null, quantity: 1, position: 0 },
      { id: 'i2', comboId: COMBO, productId: BATATA, sizeId: TAM_M, quantity: 2, position: 1 },
    ],
    ...mudancas,
  });
}

function payload(mudancas: Partial<UpsertStoreProductPayload> = {}): UpsertStoreProductPayload {
  return {
    kind: 'COMBO',
    categoryId: CATEGORIA,
    name: 'Combo X-Burger',
    description: '',
    price: 30,
    status: 'DRAFT',
    comboItems: [
      { productId: BURGER, sizeId: null, quantity: 1 },
      { productId: BATATA, sizeId: TAM_M, quantity: 2 },
    ],
    sizes: [],
    optionGroups: [],
    ...mudancas,
  };
}

describe('o combo no catálogo', () => {
  let service: StoreCatalogService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    storeCategory: Record<'findMany' | 'findFirst', jest.Mock>;
    storeProduct: Record<'findMany' | 'findFirst' | 'aggregate' | 'create' | 'update', jest.Mock>;
    storeComboItem: Record<'deleteMany' | 'createMany', jest.Mock>;
    storeProductSize: Record<'deleteMany' | 'update' | 'create', jest.Mock>;
    storeOptionGroup: Record<'deleteMany' | 'update' | 'create', jest.Mock>;
    storeOption: Record<'deleteMany' | 'update' | 'create', jest.Mock>;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    const mocks = <K extends string>(...nomes: K[]) =>
      Object.fromEntries(nomes.map((nome) => [nome, jest.fn()])) as Record<K, jest.Mock>;
    prisma = {
      companyTeamMember: { findFirst: jest.fn().mockResolvedValue({ companyId: EMPRESA }) },
      storeCategory: mocks('findMany', 'findFirst'),
      storeProduct: mocks('findMany', 'findFirst', 'aggregate', 'create', 'update'),
      storeComboItem: mocks('deleteMany', 'createMany'),
      storeProductSize: mocks('deleteMany', 'update', 'create'),
      storeOptionGroup: mocks('deleteMany', 'update', 'create'),
      storeOption: mocks('deleteMany', 'update', 'create'),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof prisma) => unknown)(prisma),
    );
    prisma.storeCategory.findFirst.mockResolvedValue({ id: CATEGORIA });
    prisma.storeCategory.findMany.mockResolvedValue([
      { id: CATEGORIA, name: 'Lanches', position: 0 },
    ]);
    prisma.storeProduct.aggregate.mockResolvedValue({ _max: { position: 2 } });
    // O que o combo leva: o hambúrguer e a batata em dois tamanhos.
    prisma.storeProduct.findMany.mockResolvedValue([linhaDeProduto(), BATATA_GRAVADA]);
    prisma.storeProduct.create.mockImplementation(async ({ data }) =>
      combo({ status: data.status, price: new Prisma.Decimal(data.price) }),
    );
    prisma.storeProduct.update.mockImplementation(async () => combo());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreCatalogService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ImageKitService,
          useValue: { uploadStoreProductImage: jest.fn(), delete: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(StoreCatalogService);
  });

  describe('gravar', () => {
    it('cria o combo com o tipo, o preço dele e os itens na ordem', async () => {
      const criado = await service.createProduct(membro, payload());

      const { data } = prisma.storeProduct.create.mock.calls[0][0];
      expect(data).toMatchObject({ companyId: EMPRESA, kind: 'COMBO', price: 30, stock: null });
      expect(data.comboItems.create).toEqual([
        { productId: BURGER, sizeId: null, quantity: 1, position: 0 },
        { productId: BATATA, sizeId: TAM_M, quantity: 2, position: 1 },
      ]);
      expect(criado).toMatchObject({
        kind: 'COMBO',
        price: 30,
        comboItems: [
          { productId: BURGER, sizeId: null, quantity: 1 },
          { productId: BATATA, sizeId: TAM_M, quantity: 2 },
        ],
      });
    });

    it('lê os produtos do combo só entre os da empresa', async () => {
      await service.createProduct(membro, payload());

      expect(prisma.storeProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: EMPRESA, id: { in: [BURGER, BATATA] } },
        }),
      );
    });

    it('o produto que não é desta empresa responde como se não existisse', async () => {
      // A consulta filtrada pela empresa não devolve a batata.
      prisma.storeProduct.findMany.mockResolvedValue([linhaDeProduto()]);

      await expect(service.createProduct(membro, payload())).rejects.toMatchObject({
        response: { code: 'STORE_COMBO_ITEM_INVALID' },
      });
      expect(prisma.storeProduct.create).not.toHaveBeenCalled();
    });

    it('um combo não leva outro combo', async () => {
      prisma.storeProduct.findMany.mockResolvedValue([combo({ id: BURGER }), BATATA_GRAVADA]);

      await expect(service.createProduct(membro, payload())).rejects.toMatchObject({
        response: { message: 'Um combo não leva outro combo.' },
      });
    });

    it('produto com tamanhos pede o tamanho; sem tamanhos, não aceita um', async () => {
      await expect(
        service.createProduct(
          membro,
          payload({ comboItems: [{ productId: BATATA, sizeId: null, quantity: 1 }] }),
        ),
      ).rejects.toMatchObject({
        response: { message: 'Escolha o tamanho de Batata que vai no combo.' },
      });
      await expect(
        service.createProduct(
          membro,
          payload({ comboItems: [{ productId: BURGER, sizeId: TAM_M, quantity: 1 }] }),
        ),
      ).rejects.toMatchObject({ response: { message: 'X-Burger não tem tamanhos.' } });
      // O tamanho que é de outro produto não serve.
      await expect(
        service.createProduct(
          membro,
          payload({ comboItems: [{ productId: BATATA, sizeId: GRUPO, quantity: 1 }] }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('o produto que exige escolhas do cliente não entra: não há como fixá-las', async () => {
      prisma.storeProduct.findMany.mockResolvedValue([
        linhaDeProduto({
          optionGroups: [
            {
              id: GRUPO,
              productId: BURGER,
              name: 'Ponto',
              minChoices: 1,
              maxChoices: 1,
              position: 0,
              options: [],
            },
          ],
        }),
        BATATA_GRAVADA,
      ]);

      await expect(service.createProduct(membro, payload())).rejects.toMatchObject({
        response: { code: 'STORE_COMBO_ITEM_INVALID' },
      });
    });

    it('o rascunho aceita produto pausado; publicar não', async () => {
      const pausada = linhaDeProduto({ status: 'PAUSED' });
      prisma.storeProduct.findMany.mockResolvedValue([pausada, BATATA_GRAVADA]);

      await expect(
        service.createProduct(membro, payload({ status: 'DRAFT' })),
      ).resolves.toBeDefined();
      await expect(
        service.createProduct(membro, payload({ status: 'PUBLISHED' })),
      ).rejects.toMatchObject({
        response: {
          code: 'STORE_PRODUCT_NOT_PUBLISHABLE',
          message: expect.stringContaining('"X-Burger" está pausado'),
        },
      });
    });

    it('publica quando tudo o que ele leva está à venda', async () => {
      await expect(
        service.createProduct(membro, payload({ status: 'PUBLISHED' })),
      ).resolves.toMatchObject({
        kind: 'COMBO',
      });
    });

    it('publicar sem itens é recusado, mas o rascunho vazio se guarda', async () => {
      await expect(
        service.createProduct(membro, payload({ status: 'PUBLISHED', comboItems: [] })),
      ).rejects.toMatchObject({ response: { message: expect.stringContaining('sem itens') } });
      await expect(
        service.createProduct(membro, payload({ status: 'DRAFT', comboItems: [] })),
      ).resolves.toBeDefined();
    });
  });

  describe('editar', () => {
    beforeEach(() => {
      prisma.storeProduct.findFirst.mockResolvedValue(combo());
    });

    it('troca os itens de uma vez: apaga os que estavam e grava a lista nova', async () => {
      await service.updateProduct(
        membro,
        COMBO,
        payload({ comboItems: [{ productId: BURGER, sizeId: null, quantity: 3 }] }),
      );

      expect(prisma.storeComboItem.deleteMany).toHaveBeenCalledWith({ where: { comboId: COMBO } });
      expect(prisma.storeComboItem.createMany).toHaveBeenCalledWith({
        data: [{ comboId: COMBO, productId: BURGER, sizeId: null, quantity: 3, position: 0 }],
      });
    });

    it('o combo não vira produto, nem o produto vira combo', async () => {
      // Sem `kind` é produto: não é o que está gravado.
      const { kind: _tipo, comboItems: _itens, ...comoProduto } = payload();
      await expect(service.updateProduct(membro, COMBO, comoProduto)).rejects.toMatchObject({
        response: {
          code: 'STORE_PRODUCT_KIND_LOCKED',
          message: 'Um combo não vira produto. Crie o produto à parte.',
        },
      });

      prisma.storeProduct.findFirst.mockResolvedValue(linhaDeProduto());
      await expect(service.updateProduct(membro, BURGER, payload())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.storeComboItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.storeProduct.update).not.toHaveBeenCalled();
    });

    it('editar um produto comum não mexe em itens de combo', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(linhaDeProduto());
      prisma.storeProduct.update.mockResolvedValue(linhaDeProduto());
      const { kind: _tipo, comboItems: _itens, ...comoProduto } = payload();

      await service.updateProduct(membro, BURGER, { ...comoProduto, price: 22 });

      expect(prisma.storeComboItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.storeComboItem.createMany).not.toHaveBeenCalled();
    });

    it('voltar a vender um combo confere de novo o que ele leva', async () => {
      prisma.storeProduct.findFirst.mockResolvedValue(combo({ status: 'PAUSED' }));
      prisma.storeProduct.findMany.mockResolvedValue([
        linhaDeProduto({ status: 'DRAFT' }),
        BATATA_GRAVADA,
      ]);

      await expect(service.updateProductStatus(membro, COMBO, 'PUBLISHED')).rejects.toMatchObject({
        response: { code: 'STORE_PRODUCT_NOT_PUBLISHABLE' },
      });

      prisma.storeProduct.findMany.mockResolvedValue([linhaDeProduto(), BATATA_GRAVADA]);
      await expect(service.updateProductStatus(membro, COMBO, 'PUBLISHED')).resolves.toMatchObject({
        kind: 'COMBO',
      });
    });

    it('pausar o combo nunca depende dos itens', async () => {
      await service.updateProductStatus(membro, COMBO, 'PAUSED');

      expect(prisma.storeProduct.findMany).not.toHaveBeenCalled();
    });
  });

  describe('o que o cliente vê', () => {
    const vitrine = async (linhas: unknown[]) => {
      prisma.storeProduct.findMany.mockResolvedValue(linhas);
      return service.publicCatalog(EMPRESA);
    };
    const doCombo = (r: Awaited<ReturnType<typeof vitrine>>) =>
      r.products.find((p) => p.id === COMBO);

    it('o combo vai com o que leva, pelo nome, e com o valor dos itens separados', async () => {
      const r = await vitrine([linhaDeProduto(), BATATA_GRAVADA, combo()]);

      expect(doCombo(r)).toMatchObject({
        kind: 'COMBO',
        price: 30,
        esgotado: false,
        restam: null,
        combo: {
          itens: [
            { produtoId: BURGER, nome: 'X-Burger', tamanho: null, quantidade: 1 },
            { produtoId: BATATA, nome: 'Batata', tamanho: 'Média', quantidade: 2 },
          ],
          // 22 + 2 x 12.
          valorSeparado: 46,
        },
      });
    });

    it('o produto comum continua sem combo, e nada de interno vaza', async () => {
      const r = await vitrine([linhaDeProduto(), BATATA_GRAVADA, combo()]);

      const burger = r.products.find((p) => p.id === BURGER)!;
      expect(burger).toMatchObject({ kind: 'PRODUCT', combo: null });
      for (const produto of r.products) {
        expect(produto).not.toHaveProperty('stock');
        expect(produto).not.toHaveProperty('comboItems');
        expect(produto).not.toHaveProperty('status');
      }
    });

    it('o estoque do combo sai dos produtos que ele leva: o que mais limita manda', async () => {
      // 10 hambúrgueres dão 10 combos; 7 batatas, duas por combo, dão 3.
      const r = await vitrine([
        linhaDeProduto({ stock: 10 }),
        { ...BATATA_GRAVADA, stock: 7 },
        combo(),
      ]);

      expect(doCombo(r)).toMatchObject({ esgotado: false, restam: 3 });
    });

    it('falta um item: o combo aparece como esgotado, e continua na lista', async () => {
      const r = await vitrine([linhaDeProduto({ stock: 0 }), BATATA_GRAVADA, combo()]);

      expect(doCombo(r)).toMatchObject({ esgotado: true, restam: null });
    });

    it('produto pausado, rascunho ou apagado tira o combo da página', async () => {
      for (const produtos of [
        [linhaDeProduto({ status: 'PAUSED' }), BATATA_GRAVADA],
        [linhaDeProduto({ status: 'DRAFT' }), BATATA_GRAVADA],
        // Sem o hambúrguer: foi apagado.
        [BATATA_GRAVADA],
      ]) {
        const r = await vitrine([...produtos, combo()]);
        expect(doCombo(r)).toBeUndefined();
      }
    });

    it('o tamanho que acabou tira o combo, e o produto que não está entre os publicados também', async () => {
      expect(doCombo(await vitrine([linhaDeProduto(), batata(false), combo()]))).toBeUndefined();

      // A consulta da página só traz os publicados com seção: o hambúrguer que não veio é como se não existisse.
      expect(doCombo(await vitrine([linhaDeProduto(), combo()]))).toBeUndefined();
    });

    it('o combo pode ser a única coisa de uma seção', async () => {
      const r = await vitrine([linhaDeProduto({ categoryId: CATEGORIA }), BATATA_GRAVADA, combo()]);

      expect(r.categories.map((c) => c.name)).toEqual(['Lanches']);
    });

    it('o combo não publicado nem entra na consulta', async () => {
      await vitrine([]);

      expect(prisma.storeProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: EMPRESA, status: 'PUBLISHED', categoryId: { not: null } },
        }),
      );
    });
  });
});
