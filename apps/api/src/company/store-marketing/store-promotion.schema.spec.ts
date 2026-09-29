import { storePromotionSchema, type StorePromotionInput } from '@motoboycity/validation';

/**
 * A promoção que a loja cadastra. Cada recusa diz o campo e o que fazer: quem
 * configura é um lojista pequeno, muitas vezes pelo celular.
 */

const PRODUTO = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const SECAO = '5c1e3a7d-2b4f-4c8a-9d0e-6f7a8b9c0d1e';

const base: StorePromotionInput = {
  nome: 'Açaí 20% OFF',
  tipo: 'PERCENTUAL',
  alvo: 'PRODUTO',
  produtoId: PRODUTO,
  categoriaId: null,
  percentual: 20,
  precoPromocional: null,
  leve: null,
  pague: null,
  inicio: null,
  fim: null,
  horaInicio: null,
  horaFim: null,
  diasDaSemana: [],
  limiteDeUsos: null,
  ativa: true,
};

/** Os campos com erro, do jeito que a tela os mostra. */
function erros(mudancas: Partial<StorePromotionInput>): Record<string, string> {
  const resultado = storePromotionSchema.safeParse({ ...base, ...mudancas });
  if (resultado.success) return {};
  return Object.fromEntries(
    resultado.error.issues.map((problema) => [String(problema.path[0]), problema.message]),
  );
}

describe('storePromotionSchema', () => {
  it('a promoção completa passa, e nasce ligada, sem limite e sem horário', () => {
    const resultado = storePromotionSchema.parse({
      nome: '  Açaí 20% OFF ',
      tipo: 'PERCENTUAL',
      alvo: 'PRODUTO',
      produtoId: PRODUTO,
      percentual: 20,
    });

    expect(resultado).toMatchObject({
      nome: 'Açaí 20% OFF',
      ativa: true,
      limiteDeUsos: null,
      inicio: null,
      horaInicio: null,
      diasDaSemana: [],
    });
  });

  it('o que o tipo não usa é descartado, e não gravado', () => {
    const resultado = storePromotionSchema.parse({
      ...base,
      // Sobras de quem trocou de tipo, ou de um alvo, no formulário.
      categoriaId: SECAO,
      leve: 3,
      pague: 2,
      precoPromocional: 10,
    });

    expect(resultado).toMatchObject({
      produtoId: PRODUTO,
      categoriaId: null,
      percentual: 20,
      leve: null,
      pague: null,
      precoPromocional: null,
    });
  });

  describe('o alvo', () => {
    it('produto e seção pedem o que o alvo escolhido pede', () => {
      expect(erros({ produtoId: null })).toEqual({ produtoId: 'Escolha o produto.' });
      expect(erros({ alvo: 'CATEGORIA', produtoId: null, categoriaId: null })).toEqual({
        categoriaId: 'Escolha a seção.',
      });
      expect(erros({ alvo: 'CATEGORIA', produtoId: null, categoriaId: SECAO })).toEqual({});
      expect(erros({ produtoId: 'acai' })).toHaveProperty('produtoId');
    });

    it('o nome é obrigatório e cabe na lista', () => {
      expect(erros({ nome: '   ' })).toHaveProperty('nome');
      expect(erros({ nome: 'N'.repeat(61) })).toHaveProperty('nome');
    });
  });

  describe('desconto em %', () => {
    it('de 1% a 90%, inteiro', () => {
      expect(erros({ percentual: 1 })).toEqual({});
      expect(erros({ percentual: 90 })).toEqual({});
      for (const invalido of [0, 91, 100, 12.5, -5, null]) {
        expect(erros({ percentual: invalido })).toEqual({
          percentual: 'Use um desconto inteiro de 1% a 90%.',
        });
      }
    });
  });

  describe('preço promocional', () => {
    const preco = { tipo: 'PRECO' as const, percentual: null, precoPromocional: 39.9 };

    it('vale para um produto, com preço positivo de até dois decimais', () => {
      expect(erros(preco)).toEqual({});
      expect(erros({ ...preco, precoPromocional: 0 })).toHaveProperty('precoPromocional');
      expect(erros({ ...preco, precoPromocional: -1 })).toHaveProperty('precoPromocional');
      expect(erros({ ...preco, precoPromocional: null })).toHaveProperty('precoPromocional');
      expect(erros({ ...preco, precoPromocional: 39.999 })).toEqual({
        precoPromocional: 'Use no máximo dois decimais.',
      });
    });

    it('não vale para uma seção inteira, que tem produtos de preços diferentes', () => {
      expect(erros({ ...preco, alvo: 'CATEGORIA', produtoId: null, categoriaId: SECAO })).toEqual({
        alvo: 'O preço promocional vale para um produto, e não para uma seção inteira.',
      });
    });
  });

  describe('leve X, pague Y', () => {
    const leve = { tipo: 'LEVE_PAGUE' as const, percentual: null, leve: 3, pague: 2 };

    it('leva de 2 a 10 e paga menos do que leva, a partir de 1', () => {
      expect(erros(leve)).toEqual({});
      expect(erros({ ...leve, leve: 1, pague: 1 })).toHaveProperty('leve');
      expect(erros({ ...leve, leve: 11 })).toHaveProperty('leve');
      expect(erros({ ...leve, pague: 3 })).toHaveProperty('pague');
      expect(erros({ ...leve, pague: 0 })).toHaveProperty('pague');
      expect(erros({ ...leve, leve: null, pague: null })).toMatchObject({
        leve: expect.any(String),
        pague: expect.any(String),
      });
    });
  });

  describe('segundo item com desconto', () => {
    it('de 1% a 100% no segundo', () => {
      const segundo = { tipo: 'SEGUNDO_COM_DESCONTO' as const };
      expect(erros({ ...segundo, percentual: 50 })).toEqual({});
      expect(erros({ ...segundo, percentual: 100 })).toEqual({});
      expect(erros({ ...segundo, percentual: 101 })).toHaveProperty('percentual');
      expect(erros({ ...segundo, percentual: 0 })).toHaveProperty('percentual');
    });
  });

  describe('quando vale', () => {
    it('as datas, com a final depois da inicial', () => {
      expect(erros({ inicio: '2026-10-01', fim: '2026-10-31' })).toEqual({});
      expect(erros({ inicio: '2026-10-01', fim: '2026-10-01' })).toEqual({});
      expect(erros({ inicio: '2026-10-31', fim: '2026-10-01' })).toEqual({
        fim: 'A data final vem antes da inicial.',
      });
      expect(erros({ inicio: '01/10/2026' })).toHaveProperty('inicio');
      expect(erros({ fim: '2026-13-45' })).toHaveProperty('fim');
      // Uma ponta só é uma promoção sem começo, ou sem fim.
      expect(erros({ inicio: '2026-10-01' })).toEqual({});
      expect(erros({ fim: '2026-10-31' })).toEqual({});
    });

    it('o horário vem com começo e fim, ou não vem', () => {
      expect(erros({ horaInicio: '11:00', horaFim: '14:00' })).toEqual({});
      // Passar da meia-noite é permitido.
      expect(erros({ horaInicio: '22:00', horaFim: '02:00' })).toEqual({});
      expect(erros({ horaInicio: '11:00', horaFim: null })).toHaveProperty('horaFim');
      expect(erros({ horaInicio: null, horaFim: '14:00' })).toHaveProperty('horaInicio');
      expect(erros({ horaInicio: '25:00', horaFim: '14:00' })).toHaveProperty('horaInicio');
    });

    it('os dias da semana, de 0 a 6, sem repetir', () => {
      expect(erros({ diasDaSemana: [5, 6, 0] })).toEqual({});
      expect(erros({ diasDaSemana: [1, 1] })).toHaveProperty('diasDaSemana');
      expect(erros({ diasDaSemana: [7] })).toHaveProperty('diasDaSemana');
      expect(erros({ diasDaSemana: [-1] })).toHaveProperty('diasDaSemana');
    });

    it('o limite de usos é um inteiro a partir de 1, ou nenhum', () => {
      expect(erros({ limiteDeUsos: 50 })).toEqual({});
      expect(erros({ limiteDeUsos: 0 })).toHaveProperty('limiteDeUsos');
      expect(erros({ limiteDeUsos: 2.5 })).toHaveProperty('limiteDeUsos');
    });
  });
});
