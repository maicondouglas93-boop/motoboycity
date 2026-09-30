import {
  LIMITE_DO_AVISO_DE_ESTOQUE,
  estoqueNaVitrine,
  unidadesQueCabem,
  upsertStoreProductSchema,
} from '@motoboycity/validation';

/**
 * O estoque opcional do produto: o que a página pode saber dele, quantas unidades ainda
 * cabem na sacola, e o que a loja pode cadastrar.
 */

describe('estoqueNaVitrine', () => {
  it('sem controle, não há o que dizer', () => {
    expect(estoqueNaVitrine(null)).toEqual({ esgotado: false, restam: null });
  });

  it('zero é esgotado, e o número exato não vai', () => {
    expect(estoqueNaVitrine(0)).toEqual({ esgotado: true, restam: null });
    // Um estoque negativo não devia existir, mas se existir não é "restam -2".
    expect(estoqueNaVitrine(-2)).toEqual({ esgotado: true, restam: null });
  });

  it('com poucas unidades a página sabe quantas restam; acima do limite, só que há bastante', () => {
    expect(estoqueNaVitrine(1)).toEqual({ esgotado: false, restam: 1 });
    expect(estoqueNaVitrine(LIMITE_DO_AVISO_DE_ESTOQUE)).toEqual({
      esgotado: false,
      restam: LIMITE_DO_AVISO_DE_ESTOQUE,
    });
    expect(estoqueNaVitrine(LIMITE_DO_AVISO_DE_ESTOQUE + 1)).toEqual({
      esgotado: false,
      restam: null,
    });
    expect(estoqueNaVitrine(500)).toEqual({ esgotado: false, restam: null });
  });
});

describe('unidadesQueCabem', () => {
  it('sem limite conhecido, a página não limita (o servidor confere no pedido)', () => {
    expect(unidadesQueCabem({ esgotado: false, restam: null }, 0)).toBeNull();
    expect(unidadesQueCabem({ esgotado: false, restam: null }, 40)).toBeNull();
  });

  it('com poucas unidades, cabe o que sobra depois do que já está na sacola', () => {
    expect(unidadesQueCabem({ esgotado: false, restam: 3 }, 0)).toBe(3);
    expect(unidadesQueCabem({ esgotado: false, restam: 3 }, 2)).toBe(1);
    expect(unidadesQueCabem({ esgotado: false, restam: 3 }, 3)).toBe(0);
  });

  it('nunca dá negativo, e esgotado não cabe nada', () => {
    expect(unidadesQueCabem({ esgotado: false, restam: 3 }, 9)).toBe(0);
    expect(unidadesQueCabem({ esgotado: true, restam: null }, 0)).toBe(0);
  });
});

describe('o estoque no produto que a loja cadastra', () => {
  const base = {
    categoryId: null,
    name: 'Açaí',
    description: '',
    price: 10,
    status: 'DRAFT' as const,
    sizes: [],
    optionGroups: [],
  };

  const estoque = (stock: unknown) => upsertStoreProductSchema.safeParse({ ...base, stock });

  it('é opcional: ausente fica ausente, e o servidor não mexe no que está gravado', () => {
    const resultado = upsertStoreProductSchema.parse(base);

    expect(resultado.stock).toBeUndefined();
  });

  it('null tira o controle; zero é esgotado; um inteiro positivo é o estoque', () => {
    expect(estoque(null)).toMatchObject({ success: true, data: { stock: null } });
    expect(estoque(0)).toMatchObject({ success: true, data: { stock: 0 } });
    expect(estoque(25)).toMatchObject({ success: true, data: { stock: 25 } });
    expect(estoque(999_999).success).toBe(true);
  });

  it('recusa negativo, decimal, texto e o que passa do limite, dizendo o motivo', () => {
    const mensagem = (valor: unknown) => {
      const resultado = estoque(valor);
      return resultado.success ? null : resultado.error.issues[0]?.message;
    };

    expect(mensagem(-1)).toBe('O estoque não pode ser negativo.');
    expect(mensagem(2.5)).toBe('O estoque é um número inteiro.');
    expect(mensagem('dez')).toBe('Informe o estoque como um número.');
    expect(mensagem(1_000_000)).toBe('Use no máximo 999.999 no estoque.');
  });
});
