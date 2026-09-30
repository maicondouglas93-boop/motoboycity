import type { CupomPublico, PromocaoPublica } from '@motoboycity/types';
import {
  aplicarCupom,
  aplicarPromocoes,
  capacidadeDoCombo,
  economiaDoCombo,
  estoqueDoCombo,
  ofertaDoProduto,
  precoDoItemDoCombo,
  storeProductIssues,
  upsertStoreProductSchema,
  valorSeparadoDoCombo,
  type ComponenteParaCombo,
  type LinhaParaPrecificar,
  type LinhaPrecificada,
  type StoreProductForIssues,
} from '@motoboycity/validation';

/**
 * O combo: as contas que o servidor e a tela fazem igual (o valor dos itens separados, a economia,
 * quantos combos o estoque dá), o que ele exige para ir ao ar, e o lugar dele nas promoções e nos
 * cupons — o preço do combo já é o especial.
 */

const ID = (n: number) => `0b7a3a52-2222-4a2e-9d7e-${String(n).padStart(12, '0')}`;
const BURGER = ID(1);
const BATATA = ID(2);
const REFRI = ID(3);
const TAM_M = ID(11);
const TAM_G = ID(12);
const CATEGORIA = ID(90);

function componente(mudancas: Partial<ComponenteParaCombo> = {}): ComponenteParaCombo {
  return {
    id: BURGER,
    kind: 'PRODUCT',
    status: 'PUBLISHED',
    categoryId: CATEGORIA,
    name: 'X-Burger',
    description: 'Pão, carne e queijo',
    imageUrl: null,
    price: 22,
    sizes: [],
    optionGroups: [],
    ...mudancas,
  };
}

const BATATA_COM_TAMANHOS = componente({
  id: BATATA,
  name: 'Batata',
  price: null,
  sizes: [
    { id: TAM_M, name: 'Média', price: 12, available: true },
    { id: TAM_G, name: 'Grande', price: 16, available: true },
  ],
});

function mapa(...produtos: ComponenteParaCombo[]): Map<string, ComponenteParaCombo> {
  return new Map(produtos.map((produto) => [produto.id, produto]));
}

const COMBO_BASE = {
  kind: 'COMBO' as const,
  categoryId: CATEGORIA,
  name: 'Combo X-Burger',
  description: 'O clássico',
  imageUrl: 'https://ik.imagekit.io/x.jpg',
  price: 38,
  sizes: [],
  optionGroups: [],
};

describe('as contas do combo', () => {
  const produtos = mapa(componente(), BATATA_COM_TAMANHOS);

  it('o preço de um item é o do tamanho fixo, ou o único do produto', () => {
    expect(
      precoDoItemDoCombo({ productId: BURGER, sizeId: null, quantity: 1 }, produtos.get(BURGER)),
    ).toBe(22);
    expect(
      precoDoItemDoCombo({ productId: BATATA, sizeId: TAM_G, quantity: 1 }, produtos.get(BATATA)),
    ).toBe(16);
    // O tamanho que sumiu, ou o produto que sumiu, não têm preço: não se inventa economia.
    expect(
      precoDoItemDoCombo({ productId: BATATA, sizeId: ID(99), quantity: 1 }, produtos.get(BATATA)),
    ).toBeNull();
    expect(
      precoDoItemDoCombo({ productId: REFRI, sizeId: null, quantity: 1 }, undefined),
    ).toBeNull();
  });

  it('o valor separado soma preço x quantidade em centavos, sem erro de ponto flutuante', () => {
    const itens = [
      { productId: BURGER, sizeId: null, quantity: 2 },
      { productId: BATATA, sizeId: TAM_M, quantity: 1 },
    ];

    expect(valorSeparadoDoCombo(itens, (id) => produtos.get(id))).toBe(56);
    expect(
      valorSeparadoDoCombo([{ productId: REFRI, sizeId: null, quantity: 3 }], () => ({
        price: 0.1,
        sizes: [],
      })),
    ).toBe(0.3);
  });

  it('se algum item não se resolve, não há valor separado', () => {
    expect(
      valorSeparadoDoCombo(
        [
          { productId: BURGER, sizeId: null, quantity: 1 },
          { productId: REFRI, sizeId: null, quantity: 1 },
        ],
        (id) => produtos.get(id),
      ),
    ).toBeNull();
  });

  it('a economia é a diferença para o preço do combo, e nunca negativa', () => {
    expect(economiaDoCombo(38, 56)).toBe(18);
    expect(economiaDoCombo(56, 56)).toBe(0);
    expect(economiaDoCombo(60, 56)).toBe(0);
    expect(economiaDoCombo(38, null)).toBe(0);
  });
});

describe('o estoque do combo é o dos produtos que ele leva', () => {
  it('sem item com estoque controlado, o combo vende sem limite', () => {
    expect(capacidadeDoCombo([{ stock: null, quantity: 1 }])).toBeNull();
    expect(estoqueDoCombo([])).toEqual({ esgotado: false, restam: null });
  });

  it('o item que mais limita manda: estoque dividido pela quantidade que o combo leva', () => {
    // 10 hambúrgueres (1 por combo) dão 10; 7 batatas (2 por combo) dão 3.
    const itens = [
      { stock: 10, quantity: 1 },
      { stock: 7, quantity: 2 },
      { stock: null, quantity: 1 },
    ];

    expect(capacidadeDoCombo(itens)).toBe(3);
    expect(estoqueDoCombo(itens)).toEqual({ esgotado: false, restam: 3 });
  });

  it('falta para montar um combo inteiro: esgotado, ainda que sobre estoque solto', () => {
    // Sobra 1 batata, mas o combo leva 2.
    expect(estoqueDoCombo([{ stock: 1, quantity: 2 }])).toEqual({ esgotado: true, restam: null });
    expect(estoqueDoCombo([{ stock: 0, quantity: 1 }])).toEqual({ esgotado: true, restam: null });
  });

  it('com bastante, a página não fala em quantidade (a mesma regra do produto)', () => {
    expect(estoqueDoCombo([{ stock: 60, quantity: 2 }])).toEqual({ esgotado: false, restam: null });
    expect(estoqueDoCombo([{ stock: 12, quantity: 2 }])).toEqual({ esgotado: false, restam: null });
    expect(estoqueDoCombo([{ stock: 10, quantity: 2 }])).toEqual({ esgotado: false, restam: 5 });
  });
});

describe('o combo no contrato do produto', () => {
  const corpo = (mudancas: Record<string, unknown> = {}) => ({
    kind: 'COMBO',
    categoryId: CATEGORIA,
    name: 'Combo X-Burger',
    description: '',
    price: 38,
    status: 'DRAFT',
    comboItems: [
      { productId: BURGER, sizeId: null, quantity: 1 },
      { productId: BATATA, sizeId: TAM_M, quantity: 2 },
    ],
    sizes: [],
    optionGroups: [],
    ...mudancas,
  });

  it('aceita o combo com itens, e o produto continua sem `kind`', () => {
    expect(upsertStoreProductSchema.safeParse(corpo()).success).toBe(true);
    const { kind: _tipo, comboItems: _itens, ...produto } = corpo();
    expect(upsertStoreProductSchema.safeParse(produto).success).toBe(true);
  });

  it('o combo tem de trazer a lista, mesmo vazia (rascunho sem itens ainda)', () => {
    const { comboItems: _itens, ...semLista } = corpo();
    expect(upsertStoreProductSchema.safeParse(semLista).success).toBe(false);
    expect(upsertStoreProductSchema.safeParse(corpo({ comboItems: [] })).success).toBe(true);
  });

  it('o combo não tem tamanhos nem estoque próprio', () => {
    const comTamanho = upsertStoreProductSchema.safeParse(
      corpo({ sizes: [{ name: 'G', price: 30, available: true }] }),
    );
    expect(comTamanho.success).toBe(false);
    if (!comTamanho.success)
      expect(comTamanho.error.issues[0]?.message).toBe('O combo não tem tamanhos.');

    const comEstoque = upsertStoreProductSchema.safeParse(corpo({ stock: 10 }));
    expect(comEstoque.success).toBe(false);
    // `null` é "sem controle": não diz nada, e passa.
    expect(upsertStoreProductSchema.safeParse(corpo({ stock: null })).success).toBe(true);
  });

  it('o mesmo produto duas vezes no mesmo tamanho é erro; em tamanhos diferentes, não', () => {
    const repetido = upsertStoreProductSchema.safeParse(
      corpo({
        comboItems: [
          { productId: BATATA, sizeId: TAM_M, quantity: 1 },
          { productId: BATATA, sizeId: TAM_M, quantity: 1 },
        ],
      }),
    );
    expect(repetido.success).toBe(false);

    expect(
      upsertStoreProductSchema.safeParse(
        corpo({
          comboItems: [
            { productId: BATATA, sizeId: TAM_M, quantity: 1 },
            { productId: BATATA, sizeId: TAM_G, quantity: 1 },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it('a quantidade é um inteiro de 1 a 20, e são até 12 itens', () => {
    for (const quantity of [0, -1, 1.5, 21]) {
      expect(
        upsertStoreProductSchema.safeParse(
          corpo({ comboItems: [{ productId: BURGER, sizeId: null, quantity }] }),
        ).success,
      ).toBe(false);
    }
    const treze = Array.from({ length: 13 }, (_, i) => ({
      productId: ID(200 + i),
      sizeId: null,
      quantity: 1,
    }));
    expect(upsertStoreProductSchema.safeParse(corpo({ comboItems: treze })).success).toBe(false);
  });

  it('só o combo leva itens', () => {
    const { kind: _tipo, ...produto } = corpo();
    expect(upsertStoreProductSchema.safeParse(produto).success).toBe(false);
  });
});

describe('o que impede o combo de ir ao ar', () => {
  const itens = [
    { productId: BURGER, sizeId: null, quantity: 1 },
    { productId: BATATA, sizeId: TAM_M, quantity: 1 },
  ];
  const combo = { ...COMBO_BASE, comboItems: itens };
  const bloqueios = (
    produtos: Map<string, ComponenteParaCombo>,
    c: StoreProductForIssues = combo,
  ) =>
    storeProductIssues(c, produtos)
      .filter((pendencia) => pendencia.blocking)
      .map((pendencia) => pendencia.text);

  it('com tudo à venda, não falta nada', () => {
    expect(bloqueios(mapa(componente(), BATATA_COM_TAMANHOS))).toEqual([]);
  });

  it('sem itens não dá para vender', () => {
    expect(storeProductIssues({ ...COMBO_BASE, comboItems: [] })).toContainEqual({
      text: 'sem itens — o combo precisa levar pelo menos um produto',
      blocking: true,
    });
  });

  it('produto pausado ou em rascunho tira o combo do ar, dizendo qual', () => {
    expect(bloqueios(mapa(componente({ status: 'PAUSED' }), BATATA_COM_TAMANHOS))).toEqual([
      '"X-Burger" está pausado — o combo sai do ar enquanto isso',
    ]);
    expect(bloqueios(mapa(componente(), { ...BATATA_COM_TAMANHOS, status: 'DRAFT' }))).toEqual([
      '"Batata" está em rascunho — o combo sai do ar enquanto isso',
    ]);
  });

  it('produto apagado do cardápio', () => {
    expect(bloqueios(mapa(BATATA_COM_TAMANHOS))).toEqual([
      'um produto do combo foi removido do cardápio',
    ]);
  });

  it('o tamanho fixo que acabou ou foi removido', () => {
    const acabou = {
      ...BATATA_COM_TAMANHOS,
      sizes: BATATA_COM_TAMANHOS.sizes.map((t) =>
        t.id === TAM_M ? { ...t, available: false } : t,
      ),
    };
    expect(bloqueios(mapa(componente(), acabou))).toEqual(['o tamanho Média de "Batata" acabou']);

    const removido = {
      ...BATATA_COM_TAMANHOS,
      sizes: BATATA_COM_TAMANHOS.sizes.filter((t) => t.id !== TAM_M),
    };
    expect(bloqueios(mapa(componente(), removido))).toEqual([
      'o tamanho escolhido de "Batata" foi removido',
    ]);
  });

  it('o produto que deixou de ter tamanhos, e o que passou a exigir escolhas', () => {
    const semTamanhos = { ...BATATA_COM_TAMANHOS, price: 12, sizes: [] };
    expect(bloqueios(mapa(componente(), semTamanhos))).toEqual(['"Batata" não tem mais tamanhos']);

    const exigente = componente({
      optionGroups: [
        { name: 'Ponto', minChoices: 1, options: [{ name: 'Ao ponto', available: true }] },
      ],
    });
    expect(bloqueios(mapa(exigente, BATATA_COM_TAMANHOS))).toEqual([
      '"X-Burger" exige escolhas do cliente, e um combo não tem como fixá-las',
    ]);
  });

  it('um combo não leva outro combo', () => {
    const outroCombo = componente({ kind: 'COMBO' });
    expect(bloqueios(mapa(outroCombo, BATATA_COM_TAMANHOS))).toEqual([
      '"X-Burger" é um combo, e um combo não leva outro combo',
    ]);
  });

  it('o produto com pendência que trava a compra (sem preço) também segura o combo', () => {
    expect(bloqueios(mapa(componente({ price: null }), BATATA_COM_TAMANHOS))[0]).toContain(
      '"X-Burger" tem pendência (sem preço)',
    );
  });

  it('o combo tem o preço dele: sem preço, não vai', () => {
    expect(bloqueios(mapa(componente(), BATATA_COM_TAMANHOS), { ...combo, price: null })).toContain(
      'sem preço',
    );
  });

  it('sem o mapa dos produtos só se confere o que o combo traz consigo', () => {
    expect(storeProductIssues(combo).filter((pendencia) => pendencia.blocking)).toEqual([]);
  });
});

describe('o combo não recebe promoção, e não acumula com cupom', () => {
  const QUARTA = new Date('2026-09-23T12:00:00-03:00');
  const promocao = (mudancas: Partial<PromocaoPublica> = {}): PromocaoPublica => ({
    id: 'promo-1',
    nome: 'Lanches 50% OFF',
    tipo: 'PERCENTUAL',
    alvo: 'CATEGORIA',
    produtoId: null,
    categoriaId: 'lanches',
    percentual: 50,
    precoPromocional: null,
    leve: null,
    pague: null,
    inicio: null,
    fim: null,
    horaInicio: null,
    horaFim: null,
    diasDaSemana: [],
    ...mudancas,
  });
  const linha = (mudancas: Partial<LinhaParaPrecificar> = {}): LinhaParaPrecificar => ({
    chave: '0',
    produtoId: 'combo',
    categoriaId: 'lanches',
    tamanhoId: null,
    quantidade: 1,
    baseCentavos: 3800,
    adicionaisCentavos: 0,
    ...mudancas,
  });

  it('a promoção da seção baixa o produto e deixa o combo da mesma seção como está', () => {
    const { linhas, usadas } = aplicarPromocoes(
      [
        linha({ chave: '0', produtoId: 'burger', baseCentavos: 2200 }),
        linha({ chave: '1', combo: true }),
      ],
      [promocao()],
      QUARTA,
    );

    expect(linhas[0]).toMatchObject({
      totalCentavos: 1100,
      descontoCentavos: 1100,
      promocaoId: 'promo-1',
    });
    expect(linhas[1]).toMatchObject({ totalCentavos: 3800, descontoCentavos: 0, promocaoId: null });
    expect(usadas).toEqual(['promo-1']);
  });

  it('nenhuma promoção conta o combo: sem uso gasto quando só há combo na sacola', () => {
    const { usadas } = aplicarPromocoes(
      [linha({ combo: true, quantidade: 3 })],
      [promocao({ alvo: 'PRODUTO', produtoId: 'combo', categoriaId: null })],
      QUARTA,
    );

    expect(usadas).toEqual([]);
  });

  it('a vitrine também não mostra oferta no combo', () => {
    const produto = { id: 'combo', categoriaId: 'lanches' };

    expect(ofertaDoProduto(produto, 3800, [promocao()], QUARTA)).not.toBeNull();
    expect(ofertaDoProduto({ ...produto, combo: true }, 3800, [promocao()], QUARTA)).toBeNull();
  });

  const cupom = (mudancas: Partial<CupomPublico> = {}): CupomPublico => ({
    codigo: 'BEMVINDO10',
    tipo: 'PERCENTUAL',
    percentual: 10,
    valor: null,
    pedidoMinimo: null,
    descontoMaximo: null,
    valeEmPromocao: false,
    produtoIds: [],
    categoriaIds: [],
    ...mudancas,
  });
  const precificada = (mudancas: Partial<LinhaPrecificada> = {}): LinhaPrecificada => ({
    ...linha(),
    originalCentavos: 3800,
    descontoCentavos: 0,
    totalCentavos: 3800,
    promocaoId: null,
    ...mudancas,
  });

  it('o cupom comum não desconta o combo: ele já é preço especial', () => {
    const resultado = aplicarCupom([precificada({ combo: true })], cupom());

    expect(resultado).toEqual({ ok: false, motivo: 'SEM_ITEM_ELEGIVEL', porPromocao: true });
  });

  it('o cupom só desconta o produto avulso da sacola, e não o combo', () => {
    const resultado = aplicarCupom(
      [
        precificada({ chave: '0', produtoId: 'burger', totalCentavos: 2000 }),
        precificada({ chave: '1', combo: true }),
      ],
      cupom(),
    );

    // 10% de 20,00 — o combo de 38,00 fica de fora.
    expect(resultado).toMatchObject({ ok: true, descontoCentavos: 200, elegivelCentavos: 2000 });
  });

  it('o cupom que a loja marcou para valer em promoção também vale no combo', () => {
    const resultado = aplicarCupom([precificada({ combo: true })], cupom({ valeEmPromocao: true }));

    expect(resultado).toMatchObject({ ok: true, descontoCentavos: 380 });
  });
});
