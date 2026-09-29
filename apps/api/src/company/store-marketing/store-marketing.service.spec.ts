import { Test, type TestingModule } from '@nestjs/testing';
import { storePromotionSchema, type StorePromotionInput } from '@motoboycity/validation';
import { Prisma, type StorePromotion, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreMarketingService } from './store-marketing.service';

/**
 * As promoções da loja: cada loja só vê e mexe nas dela, o alvo (produto ou
 * seção) tem de ser dela, e a página só recebe o que ainda vale. O banco é uma
 * lista em memória com o filtro de empresa que o Prisma faria — se uma consulta
 * esquecesse a empresa, os testes de isolamento a pegariam.
 */

const LOJA_A = 'empresa-a';
const LOJA_B = 'empresa-b';
const usuarioA = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;
const usuarioB = { id: 'user-b', type: 'COMPANY_MEMBER' } as User;
const ACAI = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const DOCES = '5c1e3a7d-2b4f-4c8a-9d0e-6f7a8b9c0d1e';
const PIZZA_DA_B = '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function promocao(mudancas: Partial<StorePromotionInput> = {}) {
  return storePromotionSchema.parse({
    nome: 'Açaí 20% OFF',
    tipo: 'PERCENTUAL',
    alvo: 'PRODUTO',
    produtoId: ACAI,
    percentual: 20,
    ...mudancas,
  });
}

function linha(mudancas: Partial<StorePromotion> = {}): StorePromotion {
  return {
    id: 'promo-1',
    companyId: LOJA_A,
    name: 'Açaí 20% OFF',
    type: 'PERCENTUAL',
    target: 'PRODUTO',
    productId: ACAI,
    categoryId: null,
    percent: 20,
    promoPrice: null,
    buyQty: null,
    payQty: null,
    startDate: null,
    endDate: null,
    startTime: null,
    endTime: null,
    weekdays: [],
    maxUses: null,
    usedCount: 0,
    active: true,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...mudancas,
  };
}

describe('StoreMarketingService — promoções', () => {
  let service: StoreMarketingService;
  let banco: StorePromotion[];
  let sequencia: number;
  let produtos: Record<
    string,
    { companyId: string; price: Prisma.Decimal | null; sizes: object[] }
  >;
  let secoes: Record<string, { companyId: string }>;

  beforeEach(async () => {
    banco = [];
    sequencia = 0;
    produtos = {
      [ACAI]: { companyId: LOJA_A, price: new Prisma.Decimal(20), sizes: [] },
      [PIZZA_DA_B]: { companyId: LOJA_B, price: new Prisma.Decimal(45), sizes: [] },
    };
    secoes = { [DOCES]: { companyId: LOJA_A } };

    const cruzar =
      (where: { id?: string; companyId?: string; active?: boolean }) => (item: StorePromotion) =>
        (where.id === undefined || item.id === where.id) &&
        (where.companyId === undefined || item.companyId === where.companyId) &&
        (where.active === undefined || item.active === where.active);

    const prisma = {
      storePromotion: {
        findMany: jest.fn(({ where }) => Promise.resolve(banco.filter(cruzar(where)))),
        findFirst: jest.fn(({ where }) => Promise.resolve(banco.find(cruzar(where)) ?? null)),
        create: jest.fn(({ data }) => {
          sequencia += 1;
          const nova = linha({
            ...data,
            id: `promo-${sequencia + 1}`,
            usedCount: 0,
            weekdays: data.weekdays ?? [],
            promoPrice:
              data.promoPrice === null || data.promoPrice === undefined
                ? null
                : new Prisma.Decimal(data.promoPrice),
          });
          banco.push(nova);
          return Promise.resolve(nova);
        }),
        updateMany: jest.fn(({ where, data }) => {
          const alvos = banco.filter(cruzar(where));
          for (const alvo of alvos) Object.assign(alvo, data);
          return Promise.resolve({ count: alvos.length });
        }),
        deleteMany: jest.fn(({ where }) => {
          const alvos = banco.filter(cruzar(where));
          banco = banco.filter((item) => !alvos.includes(item));
          return Promise.resolve({ count: alvos.length });
        }),
      },
      storeProduct: {
        findFirst: jest.fn(({ where }) => {
          const produto = produtos[where.id];
          return Promise.resolve(produto && produto.companyId === where.companyId ? produto : null);
        }),
      },
      storeCategory: {
        findFirst: jest.fn(({ where }) => {
          const secao = secoes[where.id];
          return Promise.resolve(
            secao && secao.companyId === where.companyId ? { id: where.id } : null,
          );
        }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreMarketingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StoreCatalogService,
          useValue: {
            resolveCompanyId: jest.fn((user: User) =>
              Promise.resolve(user.id === 'user-b' ? LOJA_B : LOJA_A),
            ),
          },
        },
      ],
    }).compile();
    service = module.get(StoreMarketingService);
  });

  describe('criar e ler', () => {
    it('cria a promoção da loja, com o que o tipo usa, e a lista devolve como a loja a vê', async () => {
      const criada = await service.createPromotion(usuarioA, promocao({ limiteDeUsos: 50 }));

      expect(criada).toMatchObject({
        nome: 'Açaí 20% OFF',
        tipo: 'PERCENTUAL',
        alvo: 'PRODUTO',
        produtoId: ACAI,
        percentual: 20,
        ativa: true,
        limiteDeUsos: 50,
        usos: 0,
      });
      expect(banco[0]!.companyId).toBe(LOJA_A);
      expect((await service.promotions(usuarioA)).map((item) => item.id)).toEqual([criada.id]);
    });

    it('preço promocional: produto de um preço só, e menor que o de hoje', async () => {
      const preco = promocao({ tipo: 'PRECO', percentual: null, precoPromocional: 16 });
      expect(await service.createPromotion(usuarioA, preco)).toMatchObject({
        tipo: 'PRECO',
        precoPromocional: 16,
        percentual: null,
      });

      await expect(
        service.createPromotion(
          usuarioA,
          promocao({ tipo: 'PRECO', percentual: null, precoPromocional: 20 }),
        ),
      ).rejects.toMatchObject({ response: { code: 'STORE_PROMOTION_PRICE_NOT_LOWER' } });

      produtos[ACAI]!.sizes = [{ id: 'grande' }];
      await expect(service.createPromotion(usuarioA, preco)).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_PRICE_NEEDS_SINGLE_PRICE' },
      });
    });

    it('a promoção da seção precisa de uma seção da loja', async () => {
      const secao = promocao({ alvo: 'CATEGORIA', produtoId: null, categoriaId: DOCES });
      expect(await service.createPromotion(usuarioA, secao)).toMatchObject({
        alvo: 'CATEGORIA',
        categoriaId: DOCES,
        produtoId: null,
      });
      // A loja B não tem essa seção.
      await expect(service.createPromotion(usuarioB, secao)).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_TARGET_NOT_FOUND' },
      });
    });
  });

  describe('uma loja não mexe na promoção da outra', () => {
    beforeEach(async () => {
      banco.push(linha({ id: 'da-a', companyId: LOJA_A }));
    });

    it('a lista da B não traz a da A', async () => {
      expect(await service.promotions(usuarioB)).toEqual([]);
      expect((await service.promotions(usuarioA)).map((item) => item.id)).toEqual(['da-a']);
    });

    it('a B não edita, não liga, não duplica nem apaga a promoção da A — e nada muda', async () => {
      const antes = JSON.stringify(banco);

      await expect(service.updatePromotion(usuarioB, 'da-a', promocao())).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_NOT_FOUND' },
      });
      await expect(service.setPromotionActive(usuarioB, 'da-a', false)).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_NOT_FOUND' },
      });
      await expect(service.duplicatePromotion(usuarioB, 'da-a')).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_NOT_FOUND' },
      });
      await expect(service.deletePromotion(usuarioB, 'da-a')).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_NOT_FOUND' },
      });

      expect(JSON.stringify(banco)).toBe(antes);
    });

    it('a B não prende uma promoção ao produto da A, nem a A ao produto da B', async () => {
      // O produto da A não existe para a B: ele chega do navegador, e não vale sem conferir.
      await expect(service.createPromotion(usuarioB, promocao())).rejects.toMatchObject({
        response: { code: 'STORE_PROMOTION_TARGET_NOT_FOUND' },
      });
      await expect(
        service.createPromotion(usuarioA, promocao({ produtoId: PIZZA_DA_B })),
      ).rejects.toMatchObject({ response: { code: 'STORE_PROMOTION_TARGET_NOT_FOUND' } });
      expect(banco).toHaveLength(1);
    });

    it('editar leva o alvo novo pela mesma conferência', async () => {
      await expect(
        service.updatePromotion(usuarioA, 'da-a', promocao({ produtoId: PIZZA_DA_B })),
      ).rejects.toMatchObject({ response: { code: 'STORE_PROMOTION_TARGET_NOT_FOUND' } });
      expect(banco[0]!.productId).toBe(ACAI);
    });
  });

  describe('editar, ligar, duplicar e apagar', () => {
    beforeEach(() => {
      banco.push(linha({ id: 'p1', usedCount: 7, maxUses: 100 }));
    });

    it('editar troca o que a loja mandou e mantém quantas vezes já valeu', async () => {
      const editada = await service.updatePromotion(
        usuarioA,
        'p1',
        promocao({ nome: 'Açaí 30%', percentual: 30, diasDaSemana: [5, 6, 0], limiteDeUsos: 200 }),
      );

      expect(editada).toMatchObject({
        nome: 'Açaí 30%',
        percentual: 30,
        diasDaSemana: [0, 5, 6],
        limiteDeUsos: 200,
        usos: 7,
      });
    });

    it('ligar e desligar', async () => {
      expect((await service.setPromotionActive(usuarioA, 'p1', false)).ativa).toBe(false);
      expect((await service.setPromotionActive(usuarioA, 'p1', true)).ativa).toBe(true);
    });

    it('duplicar cria uma cópia desligada e sem os usos', async () => {
      const copia = await service.duplicatePromotion(usuarioA, 'p1');

      expect(copia).toMatchObject({
        nome: 'Açaí 20% OFF (cópia)',
        ativa: false,
        usos: 0,
        limiteDeUsos: 100,
        produtoId: ACAI,
      });
      expect(copia.id).not.toBe('p1');
      expect(banco).toHaveLength(2);
    });

    it('apagar tira só a promoção pedida', async () => {
      banco.push(linha({ id: 'p2' }));

      expect(await service.deletePromotion(usuarioA, 'p1')).toEqual({ deleted: true });
      expect(banco.map((item) => item.id)).toEqual(['p2']);
    });
  });

  describe('o que a página e o pedido recebem', () => {
    beforeEach(() => {
      banco.push(
        linha({ id: 'ligada' }),
        linha({ id: 'desligada', active: false }),
        linha({ id: 'esgotada', maxUses: 5, usedCount: 5 }),
        linha({ id: 'com-uso', maxUses: 5, usedCount: 4 }),
        linha({ id: 'da-outra', companyId: LOJA_B }),
      );
    });

    it('só as ligadas e com uso, da loja — a esgotada e a desligada nem chegam', async () => {
      const publicas = await service.promocoesPublicas(LOJA_A);

      expect(publicas.map((item) => item.id)).toEqual(['ligada', 'com-uso']);
    });

    it('a página nunca recebe o limite nem quantas vezes já valeu', async () => {
      const [primeira] = await service.promocoesPublicas(LOJA_A);

      expect(primeira).not.toHaveProperty('limiteDeUsos');
      expect(primeira).not.toHaveProperty('usos');
    });

    it('o pedido recebe também os usos, para conferir ao gravar', async () => {
      const doPedido = await service.promocoesDoPedido(LOJA_A);

      expect(doPedido.find((item) => item.id === 'com-uso')).toMatchObject({
        usos: 4,
        limiteDeUsos: 5,
      });
    });
  });
});
