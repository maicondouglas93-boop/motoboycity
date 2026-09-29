import { Test, type TestingModule } from '@nestjs/testing';
import { storeCouponSchema, type StoreCouponInput } from '@motoboycity/validation';
import { Prisma, type StoreCoupon, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreCouponsService } from './store-coupons.service';

/**
 * Os cupons da loja: cada loja só vê e mexe nos dela, o código é único DENTRO da
 * loja (e o mesmo código em duas lojas não se cruza), e o pedido só aceita o que
 * ainda vale para AQUELE cliente. O banco é uma lista em memória com o filtro de
 * empresa que o Prisma faria — se uma consulta esquecesse a empresa, os testes de
 * isolamento a pegariam.
 */

const LOJA_A = 'empresa-a';
const LOJA_B = 'empresa-b';
const usuarioA = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;
const usuarioB = { id: 'user-b', type: 'COMPANY_MEMBER' } as User;
const ACAI = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const DOCES = '5c1e3a7d-2b4f-4c8a-9d0e-6f7a8b9c0d1e';
const PIZZA_DA_B = '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** Quarta-feira, 23/09/2026, meio-dia na hora da loja (UTC-3). */
const QUARTA = new Date('2026-09-23T12:00:00-03:00');

function cupom(mudancas: Partial<StoreCouponInput> = {}) {
  return storeCouponSchema.parse({
    codigo: 'BEMVINDO10',
    tipo: 'PERCENTUAL',
    percentual: 10,
    ...mudancas,
  });
}

function linha(mudancas: Partial<StoreCoupon> = {}): StoreCoupon {
  return {
    id: 'cupom-1',
    companyId: LOJA_A,
    code: 'BEMVINDO10',
    type: 'PERCENT',
    percent: 10,
    amount: null,
    minOrder: null,
    maxDiscount: null,
    startDate: null,
    endDate: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    usedCount: 0,
    productIds: [],
    categoryIds: [],
    appliesToPromoItems: false,
    showInCheckout: false,
    active: true,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...mudancas,
  };
}

describe('StoreCouponsService', () => {
  let service: StoreCouponsService;
  let banco: StoreCoupon[];
  /** Quantas vezes cada cliente usou cada cupom (os registros de uso). */
  let usos: Array<{ couponId: string; customerAuthId: string }>;
  let sequencia: number;
  let produtos: Record<string, { companyId: string }>;
  let secoes: Record<string, { companyId: string }>;

  beforeEach(async () => {
    banco = [];
    usos = [];
    sequencia = 0;
    produtos = { [ACAI]: { companyId: LOJA_A }, [PIZZA_DA_B]: { companyId: LOJA_B } };
    secoes = { [DOCES]: { companyId: LOJA_A } };

    type Where = {
      id?: string;
      companyId?: string;
      active?: boolean;
      showInCheckout?: boolean;
      code?: string | { startsWith: string };
      companyId_code?: { companyId: string; code: string };
    };
    const cruzar = (where: Where) => (item: StoreCoupon) =>
      (where.id === undefined || item.id === where.id) &&
      (where.companyId === undefined || item.companyId === where.companyId) &&
      (where.active === undefined || item.active === where.active) &&
      (where.showInCheckout === undefined || item.showInCheckout === where.showInCheckout) &&
      (where.companyId_code === undefined ||
        (item.companyId === where.companyId_code.companyId &&
          item.code === where.companyId_code.code)) &&
      (where.code === undefined ||
        (typeof where.code === 'string'
          ? item.code === where.code
          : item.code.startsWith(where.code.startsWith)));

    const prisma = {
      storeCoupon: {
        // Respeita a única ordem que o serviço pede: o mais novo primeiro.
        findMany: jest.fn(({ where, orderBy }) => {
          const achados = banco.filter(cruzar(where));
          const maisNovoPrimeiro = Array.isArray(orderBy) && orderBy[0]?.createdAt === 'desc';
          return Promise.resolve(
            maisNovoPrimeiro
              ? [...achados].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              : achados,
          );
        }),
        findFirst: jest.fn(({ where }) => Promise.resolve(banco.find(cruzar(where)) ?? null)),
        findUnique: jest.fn(({ where }) => Promise.resolve(banco.find(cruzar(where)) ?? null)),
        create: jest.fn(({ data }) => {
          // A chave única do banco: (empresa, código).
          if (banco.some((item) => item.companyId === data.companyId && item.code === data.code)) {
            throw new Prisma.PrismaClientKnownRequestError('duplicado', {
              code: 'P2002',
              clientVersion: 'teste',
            });
          }
          sequencia += 1;
          const novo = linha({
            ...data,
            id: `cupom-${sequencia + 1}`,
            usedCount: 0,
            amount: data.amount == null ? null : new Prisma.Decimal(data.amount),
            minOrder: data.minOrder == null ? null : new Prisma.Decimal(data.minOrder),
            maxDiscount: data.maxDiscount == null ? null : new Prisma.Decimal(data.maxDiscount),
          });
          banco.push(novo);
          return Promise.resolve(novo);
        }),
        updateMany: jest.fn(({ where, data }) => {
          const alvos = banco.filter(cruzar(where));
          // A chave única do banco vale também na edição.
          if (
            data.code !== undefined &&
            banco.some(
              (item) =>
                item.companyId === alvos[0]?.companyId &&
                item.code === data.code &&
                !alvos.includes(item),
            )
          ) {
            throw new Prisma.PrismaClientKnownRequestError('duplicado', {
              code: 'P2002',
              clientVersion: 'teste',
            });
          }
          for (const alvo of alvos) {
            const { amount, minOrder, maxDiscount, ...resto } = data;
            Object.assign(alvo, resto);
            if (amount !== undefined)
              alvo.amount = amount === null ? null : new Prisma.Decimal(amount);
            if (minOrder !== undefined) {
              alvo.minOrder = minOrder === null ? null : new Prisma.Decimal(minOrder);
            }
            if (maxDiscount !== undefined) {
              alvo.maxDiscount = maxDiscount === null ? null : new Prisma.Decimal(maxDiscount);
            }
          }
          return Promise.resolve({ count: alvos.length });
        }),
        deleteMany: jest.fn(({ where }) => {
          const alvos = banco.filter(cruzar(where));
          banco = banco.filter((item) => !alvos.includes(item));
          return Promise.resolve({ count: alvos.length });
        }),
      },
      storeCouponRedemption: {
        groupBy: jest.fn(({ where }) => {
          const contagem = new Map<string, number>();
          for (const uso of usos) {
            if (
              (where.couponId.in as string[]).includes(uso.couponId) &&
              uso.customerAuthId === where.customerAuthId
            ) {
              contagem.set(uso.couponId, (contagem.get(uso.couponId) ?? 0) + 1);
            }
          }
          return Promise.resolve(
            [...contagem].map(([couponId, total]) => ({ couponId, _count: { _all: total } })),
          );
        }),
        count: jest.fn(({ where }) =>
          Promise.resolve(
            usos.filter(
              (uso) =>
                uso.couponId === where.couponId && uso.customerAuthId === where.customerAuthId,
            ).length,
          ),
        ),
      },
      storeProduct: {
        count: jest.fn(({ where }) =>
          Promise.resolve(
            (where.id.in as string[]).filter((id) => produtos[id]?.companyId === where.companyId)
              .length,
          ),
        ),
      },
      storeCategory: {
        count: jest.fn(({ where }) =>
          Promise.resolve(
            (where.id.in as string[]).filter((id) => secoes[id]?.companyId === where.companyId)
              .length,
          ),
        ),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreCouponsService,
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
    service = module.get(StoreCouponsService);
  });

  describe('criar e ler', () => {
    it('cria o cupom da loja, com o que o tipo usa, e a lista devolve como a loja o vê', async () => {
      const criado = await service.createCoupon(
        usuarioA,
        cupom({ pedidoMinimo: 30, descontoMaximo: 15, limiteDeUsos: 100, limitePorCliente: 1 }),
      );

      expect(criado).toMatchObject({
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        percentual: 10,
        valor: null,
        pedidoMinimo: 30,
        descontoMaximo: 15,
        limiteDeUsos: 100,
        limitePorCliente: 1,
        valeEmPromocao: false,
        ativo: true,
        usos: 0,
      });
      expect(banco[0]!.companyId).toBe(LOJA_A);
      expect((await service.coupons(usuarioA)).map((item) => item.id)).toEqual([criado.id]);
    });

    it('cupom de valor fixo guarda o valor, e não o percentual', async () => {
      const criado = await service.createCoupon(
        usuarioA,
        cupom({ codigo: 'CINCO', tipo: 'VALOR', percentual: null, valor: 5 }),
      );

      expect(criado).toMatchObject({ tipo: 'VALOR', valor: 5, percentual: null });
    });

    it('o alcance precisa ser da loja: produtos e seções de outra empresa são recusados', async () => {
      await expect(
        service.createCoupon(usuarioA, cupom({ produtoIds: [ACAI], categoriaIds: [DOCES] })),
      ).resolves.toMatchObject({ produtoIds: [ACAI], categoriaIds: [DOCES] });

      // A loja B não tem o açaí nem a seção de doces da A.
      const alheio = { response: { code: 'STORE_COUPON_TARGET_NOT_FOUND' } };
      await expect(
        service.createCoupon(usuarioB, cupom({ codigo: 'ALHEIO1', produtoIds: [ACAI] })),
      ).rejects.toMatchObject(alheio);
      await expect(
        service.createCoupon(usuarioB, cupom({ codigo: 'ALHEIO2', categoriaIds: [DOCES] })),
      ).rejects.toMatchObject(alheio);
      // O produto dela mesma, sim.
      await expect(
        service.createCoupon(usuarioB, cupom({ codigo: 'DELA3', produtoIds: [PIZZA_DA_B] })),
      ).resolves.toBeDefined();
    });

    it('o código é único dentro da loja, mas duas lojas podem ter o mesmo', async () => {
      await service.createCoupon(usuarioA, cupom());

      await expect(service.createCoupon(usuarioA, cupom())).rejects.toMatchObject({
        response: {
          code: 'STORE_COUPON_CODE_TAKEN',
          message: 'Já existe um cupom com o código BEMVINDO10.',
        },
      });
      await expect(service.createCoupon(usuarioB, cupom())).resolves.toMatchObject({
        codigo: 'BEMVINDO10',
      });
      expect(banco.map((item) => [item.companyId, item.code])).toEqual([
        [LOJA_A, 'BEMVINDO10'],
        [LOJA_B, 'BEMVINDO10'],
      ]);
    });
  });

  describe('isolamento entre lojas', () => {
    it('a loja B não vê o cupom da A, e as rotas com o id dele respondem "não encontrado"', async () => {
      const dele = await service.createCoupon(usuarioA, cupom());

      expect(await service.coupons(usuarioB)).toEqual([]);
      const naoAchado = { response: { code: 'STORE_COUPON_NOT_FOUND' } };
      await expect(service.updateCoupon(usuarioB, dele.id, cupom())).rejects.toMatchObject(
        naoAchado,
      );
      await expect(service.setCouponActive(usuarioB, dele.id, false)).rejects.toMatchObject(
        naoAchado,
      );
      await expect(service.duplicateCoupon(usuarioB, dele.id)).rejects.toMatchObject(naoAchado);
      await expect(service.deleteCoupon(usuarioB, dele.id)).rejects.toMatchObject(naoAchado);
      // E o cupom da A segue intacto, ligado e com o mesmo desconto.
      expect(banco).toHaveLength(1);
      expect(banco[0]).toMatchObject({ active: true, percent: 10, companyId: LOJA_A });
    });

    it('o cupom de uma loja não vale na outra: a busca do pedido leva a empresa', async () => {
      banco.push(linha({ companyId: LOJA_A, code: 'SO-DA-A' }));

      await expect(
        service.paraOPedido(LOJA_A, 'cliente', 'so-da-a', QUARTA),
      ).resolves.toMatchObject({ codigo: 'SO-DA-A' });
      await expect(service.paraOPedido(LOJA_B, 'cliente', 'so-da-a', QUARTA)).rejects.toMatchObject(
        {
          response: { code: 'STORE_COUPON_NOT_FOUND' },
        },
      );
    });
  });

  describe('editar, ligar, duplicar e apagar', () => {
    it('editar troca o que a loja mandou e devolve o cupom como ficou', async () => {
      const criado = await service.createCoupon(usuarioA, cupom());

      const editado = await service.updateCoupon(
        usuarioA,
        criado.id,
        cupom({
          tipo: 'VALOR',
          percentual: null,
          valor: 7,
          pedidoMinimo: 25,
          valeEmPromocao: true,
        }),
      );

      expect(editado).toMatchObject({
        tipo: 'VALOR',
        valor: 7,
        percentual: null,
        pedidoMinimo: 25,
        valeEmPromocao: true,
      });
    });

    it('editar para o código de outro cupom da mesma loja é recusado', async () => {
      await service.createCoupon(usuarioA, cupom({ codigo: 'UM' + 'AAA' }));
      const segundo = await service.createCoupon(usuarioA, cupom({ codigo: 'OUTRO' }));

      await expect(
        service.updateCoupon(usuarioA, segundo.id, cupom({ codigo: 'UMAAA' })),
      ).rejects.toMatchObject({ response: { code: 'STORE_COUPON_CODE_TAKEN' } });
    });

    it('liga e desliga', async () => {
      const criado = await service.createCoupon(usuarioA, cupom());

      expect((await service.setCouponActive(usuarioA, criado.id, false)).ativo).toBe(false);
      expect((await service.setCouponActive(usuarioA, criado.id, true)).ativo).toBe(true);
    });

    it('duplicar cria outro, desligado e sem usos, com um código livre', async () => {
      const original = await service.createCoupon(usuarioA, cupom({ limiteDeUsos: 10 }));
      banco[0]!.usedCount = 4;

      const copia = await service.duplicateCoupon(usuarioA, original.id);
      const outraCopia = await service.duplicateCoupon(usuarioA, original.id);

      expect(copia).toMatchObject({
        codigo: 'BEMVINDO10-2',
        ativo: false,
        usos: 0,
        limiteDeUsos: 10,
      });
      expect(outraCopia.codigo).toBe('BEMVINDO10-3');
    });

    it('a cópia de um código de 20 letras cabe nos 20', async () => {
      const longo = await service.createCoupon(usuarioA, cupom({ codigo: 'A'.repeat(20) }));

      const copia = await service.duplicateCoupon(usuarioA, longo.id);

      expect(copia.codigo).toBe(`${'A'.repeat(18)}-2`);
      expect(copia.codigo).toHaveLength(20);
    });

    it('apagar tira só o cupom pedido', async () => {
      const um = await service.createCoupon(usuarioA, cupom({ codigo: 'UMUM' }));
      await service.createCoupon(usuarioA, cupom({ codigo: 'DOISDOIS' }));

      await service.deleteCoupon(usuarioA, um.id);

      expect(banco.map((item) => item.code)).toEqual(['DOISDOIS']);
    });
  });

  describe('o que o pedido confere, para aquele cliente, agora', () => {
    const confere = (codigo = 'bemvindo10', cliente = 'cliente-1', agora = QUARTA) =>
      service.paraOPedido(LOJA_A, cliente, codigo, agora);

    it('o código vale em qualquer caixa e com espaços; devolve as regras e o que é do servidor', async () => {
      banco.push(
        linha({
          minOrder: new Prisma.Decimal(30),
          maxDiscount: new Prisma.Decimal(15),
          maxUses: 100,
          usedCount: 7,
          maxUsesPerCustomer: 2,
          productIds: [ACAI],
        }),
      );

      const conferido = await confere(' bemvindo 10 ');

      expect(conferido).toEqual({
        id: 'cupom-1',
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        percentual: 10,
        valor: null,
        pedidoMinimo: 30,
        descontoMaximo: 15,
        valeEmPromocao: false,
        produtoIds: [ACAI],
        categoriaIds: [],
        usos: 7,
        limiteDeUsos: 100,
        limitePorCliente: 2,
      });
    });

    it('código que não existe, ou que nem seria um código, é "não encontrado"', async () => {
      banco.push(linha());

      for (const codigo of ['outro', '', 'a', 'com espaço demais e caracteres $$']) {
        await expect(confere(codigo)).rejects.toMatchObject({
          response: {
            code: 'STORE_COUPON_NOT_FOUND',
            message: 'Cupom não encontrado. Confira o código.',
          },
        });
      }
    });

    it('cupom desligado não vale', async () => {
      banco.push(linha({ active: false }));

      await expect(confere()).rejects.toMatchObject({
        response: { code: 'STORE_COUPON_INACTIVE', message: 'Este cupom não está disponível.' },
      });
    });

    it('antes da data inicial e depois da final, com a data na mensagem', async () => {
      banco.push(linha({ startDate: '2026-09-24' }));
      await expect(confere()).rejects.toMatchObject({
        response: {
          code: 'STORE_COUPON_NOT_STARTED',
          message: 'Este cupom vale a partir de 24/09/2026.',
        },
      });

      banco[0]!.startDate = null;
      banco[0]!.endDate = '2026-09-22';
      await expect(confere()).rejects.toMatchObject({
        response: { code: 'STORE_COUPON_EXPIRED', message: 'Este cupom venceu em 22/09/2026.' },
      });

      // No próprio dia final, ainda vale.
      banco[0]!.endDate = '2026-09-23';
      await expect(confere()).resolves.toBeDefined();
    });

    it('esgotado: o limite total de pedidos foi atingido', async () => {
      banco.push(linha({ maxUses: 5, usedCount: 5 }));

      await expect(confere()).rejects.toMatchObject({
        response: {
          code: 'STORE_COUPON_EXHAUSTED',
          message: 'Este cupom já foi usado todas as vezes.',
        },
      });

      banco[0]!.usedCount = 4;
      await expect(confere()).resolves.toBeDefined();
    });

    it('o limite por cliente conta os usos DELE, e não os dos outros', async () => {
      banco.push(linha({ maxUsesPerCustomer: 1 }));
      usos.push({ couponId: 'cupom-1', customerAuthId: 'cliente-2' });

      // O cliente 1 nunca usou; o 2 já usou.
      await expect(confere('bemvindo10', 'cliente-1')).resolves.toBeDefined();
      await expect(confere('bemvindo10', 'cliente-2')).rejects.toMatchObject({
        response: { code: 'STORE_COUPON_CUSTOMER_LIMIT', message: 'Você já usou este cupom.' },
      });
    });

    it('com limite maior que um, a mensagem diz quantas vezes ele já usou', async () => {
      banco.push(linha({ maxUsesPerCustomer: 2 }));
      usos.push(
        { couponId: 'cupom-1', customerAuthId: 'cliente-1' },
        { couponId: 'cupom-1', customerAuthId: 'cliente-1' },
      );

      await expect(confere()).rejects.toMatchObject({
        response: {
          code: 'STORE_COUPON_CUSTOMER_LIMIT',
          message: 'Você já usou este cupom 2 vezes, que é o limite.',
        },
      });
    });
  });
  describe('a lista "Cupons" do checkout', () => {
    const lista = (cliente = 'cliente-1', empresa = LOJA_A, agora = QUARTA) =>
      service.disponiveis(empresa, cliente, agora);
    /** O cupom que a loja quis mostrar. */
    const visivel = (mudancas: Partial<StoreCoupon> = {}) =>
      banco.push(
        linha({
          id: `cupom-${banco.length + 1}`,
          code: `CUPOM${banco.length + 1}`,
          showInCheckout: true,
          ...mudancas,
        }),
      );

    it('mostra só o que a loja marcou; o cupom secreto (só por código) não aparece', async () => {
      visivel({ code: 'PUBLICO10' });
      visivel({ code: 'SECRETO10', showInCheckout: false });

      expect((await lista()).map((cupom) => cupom.codigo)).toEqual(['PUBLICO10']);
      // Mas o secreto continua valendo para quem digita o código.
      await expect(
        service.paraOPedido(LOJA_A, 'cliente-1', 'secreto10', QUARTA),
      ).resolves.toMatchObject({
        codigo: 'SECRETO10',
      });
    });

    it('traz as regras e o último dia, e nada do que é só da loja', async () => {
      visivel({
        code: 'BEMVINDO10',
        minOrder: new Prisma.Decimal(30),
        maxDiscount: new Prisma.Decimal(15),
        endDate: '2026-10-31',
        maxUses: 100,
        usedCount: 7,
        maxUsesPerCustomer: 1,
        productIds: [ACAI],
      });

      const [cupom] = await lista();

      expect(cupom).toEqual({
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        percentual: 10,
        valor: null,
        pedidoMinimo: 30,
        descontoMaximo: 15,
        valeEmPromocao: false,
        produtoIds: [ACAI],
        categoriaIds: [],
        fim: '2026-10-31',
      });
      expect(JSON.stringify(cupom)).not.toMatch(/usos|usedCount|limite|maxUses|companyId|id"/);
    });

    it('o desligado, o vencido, o que ainda não começou e o esgotado ficam de fora', async () => {
      visivel({ code: 'VALE' });
      visivel({ code: 'DESLIGADO', active: false });
      visivel({ code: 'VENCIDO', endDate: '2026-09-22' });
      visivel({ code: 'FUTURO', startDate: '2026-09-24' });
      visivel({ code: 'ESGOTADO', maxUses: 5, usedCount: 5 });
      visivel({ code: 'HOJE', startDate: '2026-09-23', endDate: '2026-09-23' });

      expect((await lista()).map((cupom) => cupom.codigo).sort()).toEqual(['HOJE', 'VALE']);
    });

    it('o limite por cliente é dele: quem já usou não vê, quem não usou vê', async () => {
      visivel({ id: 'cupom-1', code: 'UMA-VEZ', maxUsesPerCustomer: 1 });
      visivel({ id: 'cupom-2', code: 'DUAS-VEZES', maxUsesPerCustomer: 2 });
      visivel({ id: 'cupom-3', code: 'SEM-LIMITE' });
      usos.push(
        { couponId: 'cupom-1', customerAuthId: 'cliente-1' },
        { couponId: 'cupom-2', customerAuthId: 'cliente-1' },
        { couponId: 'cupom-3', customerAuthId: 'cliente-1' },
      );

      expect((await lista('cliente-1')).map((cupom) => cupom.codigo).sort()).toEqual([
        'DUAS-VEZES',
        'SEM-LIMITE',
      ]);
      // O outro cliente nunca usou nenhum.
      expect((await lista('cliente-2')).map((cupom) => cupom.codigo).sort()).toEqual([
        'DUAS-VEZES',
        'SEM-LIMITE',
        'UMA-VEZ',
      ]);
    });

    it('cada loja lista só os dela', async () => {
      visivel({ code: 'DA-A' });
      visivel({ companyId: LOJA_B, code: 'DA-B' });

      expect((await lista('cliente-1', LOJA_A)).map((cupom) => cupom.codigo)).toEqual(['DA-A']);
      expect((await lista('cliente-1', LOJA_B)).map((cupom) => cupom.codigo)).toEqual(['DA-B']);
    });

    it('o mais novo primeiro, e no máximo doze', async () => {
      for (let n = 1; n <= 15; n += 1) {
        visivel({ code: `CUPOM-${n}`, createdAt: new Date(Date.UTC(2026, 8, 20, 10, 0, n)) });
      }

      const cupons = await lista();

      expect(cupons).toHaveLength(12);
      expect(cupons[0]!.codigo).toBe('CUPOM-15');
    });

    it('sem cupom nenhum visível, a lista é vazia, e nem consulta os usos do cliente', async () => {
      visivel({ code: 'SECRETO', showInCheckout: false });

      expect(await lista()).toEqual([]);
      expect(banco).toHaveLength(1);
    });
  });
});
