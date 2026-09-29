import { Test, type TestingModule } from '@nestjs/testing';
import {
  MAXIMO_DE_DESTAQUES,
  storeHighlightSchema,
  type StoreHighlightInput,
} from '@motoboycity/validation';
import type { StoreHighlight, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreHighlightsService } from './store-highlights.service';

/**
 * Os destaques da loja: cada loja só vê e mexe nos dela, os produtos têm de ser
 * dela, a ordem é sempre inteira e a página só recebe o que ainda vale. O banco é
 * uma lista em memória com o filtro de empresa que o Prisma faria — se uma consulta
 * esquecesse a empresa, os testes de isolamento a pegariam.
 */

const LOJA_A = 'empresa-a';
const LOJA_B = 'empresa-b';
const usuarioA = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;
const usuarioB = { id: 'user-b', type: 'COMPANY_MEMBER' } as User;
const ACAI = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const SUCO = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PIZZA_DA_B = '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** Quarta-feira, 23/09/2026, meio-dia na hora da loja (UTC-3). */
const QUARTA = new Date('2026-09-23T12:00:00-03:00');

function destaque(mudancas: Partial<StoreHighlightInput> = {}) {
  return storeHighlightSchema.parse({
    titulo: 'Mais pedidos',
    produtoIds: [ACAI, SUCO],
    ...mudancas,
  });
}

describe('StoreHighlightsService', () => {
  let service: StoreHighlightsService;
  let banco: StoreHighlight[];
  let sequencia: number;
  let produtos: Record<string, { companyId: string }>;

  beforeEach(async () => {
    banco = [];
    sequencia = 0;
    produtos = {
      [ACAI]: { companyId: LOJA_A },
      [SUCO]: { companyId: LOJA_A },
      [PIZZA_DA_B]: { companyId: LOJA_B },
    };

    type Where = { id?: string; companyId?: string; active?: boolean };
    const cruzar = (where: Where) => (item: StoreHighlight) =>
      (where.id === undefined || item.id === where.id) &&
      (where.companyId === undefined || item.companyId === where.companyId) &&
      (where.active === undefined || item.active === where.active);
    const ordenado = (itens: StoreHighlight[]) =>
      [...itens].sort(
        (a, b) =>
          a.position - b.position ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );

    const prisma = {
      storeHighlight: {
        findMany: jest.fn(({ where, select }) => {
          const achados = ordenado(banco.filter(cruzar(where)));
          return Promise.resolve(select ? achados.map((item) => ({ id: item.id })) : achados);
        }),
        findFirst: jest.fn(({ where }) => Promise.resolve(banco.find(cruzar(where)) ?? null)),
        count: jest.fn(({ where }) => Promise.resolve(banco.filter(cruzar(where)).length)),
        aggregate: jest.fn(({ where }) => {
          const posicoes = banco.filter(cruzar(where)).map((item) => item.position);
          return Promise.resolve({
            _max: { position: posicoes.length ? Math.max(...posicoes) : null },
          });
        }),
        create: jest.fn(({ data }) => {
          sequencia += 1;
          const novo: StoreHighlight = {
            id: `destaque-${sequencia}`,
            startDate: null,
            endDate: null,
            active: true,
            createdAt: new Date(Date.UTC(2026, 8, 20, 10, 0, sequencia)),
            updatedAt: new Date(Date.UTC(2026, 8, 20, 10, 0, sequencia)),
            ...data,
          };
          banco.push(novo);
          return Promise.resolve(novo);
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
        count: jest.fn(({ where }) =>
          Promise.resolve(
            (where.id.in as string[]).filter((id) => produtos[id]?.companyId === where.companyId)
              .length,
          ),
        ),
      },
      $transaction: jest.fn((promessas: Promise<unknown>[]) => Promise.all(promessas)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreHighlightsService,
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
    service = module.get(StoreHighlightsService);
  });

  const criar = (mudancas: Partial<StoreHighlightInput> = {}, usuario = usuarioA) =>
    service.createHighlight(usuario, destaque(mudancas));

  describe('criar e ler', () => {
    it('cria o destaque da loja, com os produtos na ordem escolhida, e a lista o devolve', async () => {
      const criado = await criar({ produtoIds: [SUCO, ACAI], inicio: '2026-10-01' });

      expect(criado).toMatchObject({
        titulo: 'Mais pedidos',
        produtoIds: [SUCO, ACAI],
        inicio: '2026-10-01',
        fim: null,
        ativo: true,
        posicao: 0,
      });
      expect(banco[0]!.companyId).toBe(LOJA_A);
      expect((await service.highlights(usuarioA)).map((item) => item.id)).toEqual([criado.id]);
    });

    it('cada destaque novo vai para o fim da fila', async () => {
      await criar({ titulo: 'Um' });
      await criar({ titulo: 'Dois' });
      await criar({ titulo: 'Três' });

      const lista = await service.highlights(usuarioA);

      expect(lista.map((item) => [item.titulo, item.posicao])).toEqual([
        ['Um', 0],
        ['Dois', 1],
        ['Três', 2],
      ]);
    });

    it('a posição de cada loja é a dela: a loja B começa do zero', async () => {
      await criar({ titulo: 'Da A' });
      await criar({ titulo: 'Da A 2' });

      const daB = await criar({ titulo: 'Da B', produtoIds: [PIZZA_DA_B] }, usuarioB);

      expect(daB.posicao).toBe(0);
    });

    it('os produtos precisam ser da loja: o de outra empresa é recusado', async () => {
      await expect(criar({ produtoIds: [ACAI, PIZZA_DA_B] })).rejects.toMatchObject({
        response: { code: 'STORE_HIGHLIGHT_PRODUCT_NOT_FOUND' },
      });
      expect(banco).toHaveLength(0);
      // A loja B, com o produto dela, cria.
      await expect(criar({ produtoIds: [PIZZA_DA_B] }, usuarioB)).resolves.toBeDefined();
      // E com o da A, não.
      await expect(criar({ produtoIds: [ACAI] }, usuarioB)).rejects.toMatchObject({
        response: { code: 'STORE_HIGHLIGHT_PRODUCT_NOT_FOUND' },
      });
    });

    it('não passa do máximo de destaques, nem duplicando', async () => {
      for (let n = 1; n <= MAXIMO_DE_DESTAQUES; n += 1) await criar({ titulo: `Destaque ${n}` });

      await expect(criar({ titulo: 'Um a mais' })).rejects.toMatchObject({
        response: { code: 'STORE_HIGHLIGHT_LIMIT' },
      });
      await expect(service.duplicateHighlight(usuarioA, banco[0]!.id)).rejects.toMatchObject({
        response: { code: 'STORE_HIGHLIGHT_LIMIT' },
      });
      // O limite é da loja: a B ainda cria.
      await expect(criar({ produtoIds: [PIZZA_DA_B] }, usuarioB)).resolves.toBeDefined();
    });
  });

  describe('isolamento entre lojas', () => {
    it('a loja B não vê o destaque da A, e as rotas com o id dele respondem "não encontrado"', async () => {
      const dele = await criar();

      expect(await service.highlights(usuarioB)).toEqual([]);
      const naoAchado = { response: { code: 'STORE_HIGHLIGHT_NOT_FOUND' } };
      await expect(
        service.updateHighlight(usuarioB, dele.id, destaque({ produtoIds: [PIZZA_DA_B] })),
      ).rejects.toMatchObject(naoAchado);
      await expect(service.setHighlightActive(usuarioB, dele.id, false)).rejects.toMatchObject(
        naoAchado,
      );
      await expect(service.duplicateHighlight(usuarioB, dele.id)).rejects.toMatchObject(naoAchado);
      await expect(service.deleteHighlight(usuarioB, dele.id)).rejects.toMatchObject(naoAchado);
      // E o da A segue intacto, ligado e com o mesmo título.
      expect(banco).toHaveLength(1);
      expect(banco[0]).toMatchObject({ active: true, title: 'Mais pedidos', companyId: LOJA_A });
    });

    it('a loja B não reordena os destaques da A com os ids dela', async () => {
      const um = await criar({ titulo: 'Um' });
      const dois = await criar({ titulo: 'Dois' });

      // A B não tem nenhum destaque: a lista que ela manda não bate com a dela.
      await expect(service.reorderHighlights(usuarioB, [dois.id, um.id])).rejects.toMatchObject({
        response: { code: 'STORE_HIGHLIGHT_ORDER_STALE' },
      });
      expect(banco.map((item) => [item.title, item.position])).toEqual([
        ['Um', 0],
        ['Dois', 1],
      ]);
    });
  });

  describe('editar, ligar, duplicar e apagar', () => {
    it('editar troca o que a loja mandou e mantém a posição', async () => {
      await criar({ titulo: 'Um' });
      const dois = await criar({ titulo: 'Dois' });

      const editado = await service.updateHighlight(
        usuarioA,
        dois.id,
        destaque({ titulo: 'Novidades', produtoIds: [SUCO], fim: '2026-12-31', ativo: false }),
      );

      expect(editado).toMatchObject({
        titulo: 'Novidades',
        produtoIds: [SUCO],
        fim: '2026-12-31',
        ativo: false,
        posicao: 1,
      });
    });

    it('editar com produto de outra loja é recusado, e o destaque não muda', async () => {
      const criado = await criar();

      await expect(
        service.updateHighlight(usuarioA, criado.id, destaque({ produtoIds: [PIZZA_DA_B] })),
      ).rejects.toMatchObject({ response: { code: 'STORE_HIGHLIGHT_PRODUCT_NOT_FOUND' } });
      expect(banco[0]!.productIds).toEqual([ACAI, SUCO]);
    });

    it('liga e desliga', async () => {
      const criado = await criar();

      expect((await service.setHighlightActive(usuarioA, criado.id, false)).ativo).toBe(false);
      expect((await service.setHighlightActive(usuarioA, criado.id, true)).ativo).toBe(true);
    });

    it('duplicar cria outro, desligado e no fim da fila', async () => {
      const original = await criar({ titulo: 'Mais pedidos', produtoIds: [SUCO, ACAI] });
      await criar({ titulo: 'Novidades' });

      const copia = await service.duplicateHighlight(usuarioA, original.id);

      expect(copia).toMatchObject({
        titulo: 'Mais pedidos (cópia)',
        produtoIds: [SUCO, ACAI],
        ativo: false,
        posicao: 2,
      });
    });

    it('a cópia de um título de 40 letras cabe nos 40', async () => {
      const longo = await criar({ titulo: 'T'.repeat(40) });

      const copia = await service.duplicateHighlight(usuarioA, longo.id);

      expect(copia.titulo).toBe(`${'T'.repeat(32)} (cópia)`);
      expect(copia.titulo.length).toBeLessThanOrEqual(40);
    });

    it('apagar tira só o destaque pedido, e o próximo entra na fila sem repetir posição', async () => {
      const um = await criar({ titulo: 'Um' });
      await criar({ titulo: 'Dois' });

      await service.deleteHighlight(usuarioA, um.id);
      const tres = await criar({ titulo: 'Três' });

      expect(banco.map((item) => item.title)).toEqual(['Dois', 'Três']);
      // A posição do "Dois" era 1; o novo vai depois dela.
      expect(tres.posicao).toBe(2);
    });
  });

  describe('a ordem', () => {
    it('grava a ordem que a loja mandou, e a lista a devolve nela', async () => {
      const um = await criar({ titulo: 'Um' });
      const dois = await criar({ titulo: 'Dois' });
      const tres = await criar({ titulo: 'Três' });

      const lista = await service.reorderHighlights(usuarioA, [tres.id, um.id, dois.id]);

      expect(lista.map((item) => [item.titulo, item.posicao])).toEqual([
        ['Três', 0],
        ['Um', 1],
        ['Dois', 2],
      ]);
      expect((await service.highlights(usuarioA)).map((item) => item.titulo)).toEqual([
        'Três',
        'Um',
        'Dois',
      ]);
    });

    it('acerta as posições, ainda que haja buraco de um destaque apagado', async () => {
      await criar({ titulo: 'Um' });
      const dois = await criar({ titulo: 'Dois' });
      const tres = await criar({ titulo: 'Três' });
      await service.deleteHighlight(usuarioA, banco[0]!.id);

      const lista = await service.reorderHighlights(usuarioA, [tres.id, dois.id]);

      expect(lista.map((item) => item.posicao)).toEqual([0, 1]);
    });

    it('a lista velha é recusada, sem desfazer o que outra aba fez', async () => {
      const um = await criar({ titulo: 'Um' });
      const dois = await criar({ titulo: 'Dois' });
      // Outra aba criou o terceiro depois de esta ler a lista.
      const tres = await criar({ titulo: 'Três' });
      const stale = { response: { code: 'STORE_HIGHLIGHT_ORDER_STALE' } };

      // Falta um.
      await expect(service.reorderHighlights(usuarioA, [dois.id, um.id])).rejects.toMatchObject(
        stale,
      );
      // Sobra um que não é da loja.
      await expect(
        service.reorderHighlights(usuarioA, [tres.id, dois.id, um.id, 'destaque-de-fora']),
      ).rejects.toMatchObject(stale);
      // Um da loja no lugar de outro.
      await expect(
        service.reorderHighlights(usuarioA, [tres.id, dois.id, 'destaque-de-fora']),
      ).rejects.toMatchObject(stale);
      expect(banco.map((item) => [item.title, item.position])).toEqual([
        ['Um', 0],
        ['Dois', 1],
        ['Três', 2],
      ]);
    });
  });

  describe('o que a página recebe', () => {
    it('só os ligados, na ordem da loja, com os produtos na ordem dela', async () => {
      const um = await criar({ titulo: 'Um', produtoIds: [SUCO, ACAI] });
      const dois = await criar({ titulo: 'Dois' });
      await criar({ titulo: 'Desligado' });
      await service.setHighlightActive(usuarioA, banco[2]!.id, false);
      await service.reorderHighlights(usuarioA, [dois.id, banco[2]!.id, um.id]);

      const publicos = await service.destaquesPublicos(LOJA_A, QUARTA);

      expect(publicos.map((item) => item.titulo)).toEqual(['Dois', 'Um']);
      expect(publicos[1]!.produtoIds).toEqual([SUCO, ACAI]);
      // O que é só da loja não vai para o cliente.
      expect(JSON.stringify(publicos)).not.toMatch(/companyId|ativo|posicao|criadoEm/);
    });

    it('o que já acabou não vai; o que ainda não começou vai, e a página o esconde até a data', async () => {
      await criar({ titulo: 'Acabou ontem', fim: '2026-09-22' });
      await criar({ titulo: 'Acaba hoje', fim: '2026-09-23' });
      await criar({ titulo: 'Começa amanhã', inicio: '2026-09-24' });
      await criar({ titulo: 'Sem datas' });

      const publicos = await service.destaquesPublicos(LOJA_A, QUARTA);

      expect(publicos.map((item) => item.titulo)).toEqual([
        'Acaba hoje',
        'Começa amanhã',
        'Sem datas',
      ]);
    });

    it('cada loja recebe só os destaques dela', async () => {
      await criar({ titulo: 'Da A' });
      await criar({ titulo: 'Da B', produtoIds: [PIZZA_DA_B] }, usuarioB);

      expect((await service.destaquesPublicos(LOJA_A, QUARTA)).map((item) => item.titulo)).toEqual([
        'Da A',
      ]);
      expect((await service.destaquesPublicos(LOJA_B, QUARTA)).map((item) => item.titulo)).toEqual([
        'Da B',
      ]);
    });
  });
});
