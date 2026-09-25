import type { StoreProduct } from '@motoboycity/types';
import { upsertStoreProductSchema } from '@motoboycity/validation';
import { describe, expect, it } from 'vitest';
import {
  montarPayload,
  pendenciasDoFormulario,
  precoParaTexto,
  produtoParaFormulario,
  saidasDoFormulario,
  textoParaPreco,
  type ProdutoNoFormulario,
} from './produto-no-formulario';

const CATEGORIA = '11111111-1111-4111-8111-111111111111';

const ACAI: StoreProduct = {
  id: '22222222-2222-4222-8222-222222222222',
  categoryId: CATEGORIA,
  name: 'Açaí',
  description: 'Batido na hora',
  imageUrl: null,
  price: null,
  status: 'PUBLISHED',
  sizes: [
    { id: '33333333-3333-4333-8333-333333333331', name: '300ml', price: 12, available: true },
    { id: '33333333-3333-4333-8333-333333333332', name: '500ml', price: 18.5, available: false },
  ],
  optionGroups: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Adicionais',
      minChoices: 0,
      maxChoices: 3,
      options: [
        { id: '55555555-5555-4555-8555-555555555551', name: 'Morango', price: 3, available: true },
        { id: '55555555-5555-4555-8555-555555555552', name: 'Granola', price: 0, available: true },
      ],
    },
  ],
  updatedAt: '2026-09-25T12:00:00.000Z',
};

function vazio(): ProdutoNoFormulario {
  return produtoParaFormulario();
}

describe('preço no padrão brasileiro', () => {
  it('lê o que a lojista digita', () => {
    expect(textoParaPreco('18,50')).toBe(18.5);
    expect(textoParaPreco('18.50')).toBe(18.5);
    expect(textoParaPreco('R$ 1.234,50')).toBe(1234.5);
    expect(textoParaPreco(' 22 ')).toBe(22);
    expect(textoParaPreco('')).toBeNull();
  });

  it('o que não é valor vira NaN, para a tela apontar o campo', () => {
    expect(textoParaPreco('abc')).toBeNaN();
    expect(textoParaPreco('1,234')).toBeNaN();
    expect(textoParaPreco('-5')).toBeNaN();
  });

  it('mostra com vírgula e dois decimais', () => {
    expect(precoParaTexto(18.5)).toBe('18,50');
    expect(precoParaTexto(1234.5)).toBe('1.234,50');
    expect(precoParaTexto(null)).toBe('');
  });
});

describe('montarPayload', () => {
  it('o produto da API volta igual, com os mesmos ids', () => {
    const montagem = montarPayload(produtoParaFormulario(ACAI), 'PUBLISHED');
    expect(montagem).toEqual({
      ok: true,
      payload: {
        categoryId: CATEGORIA,
        name: 'Açaí',
        description: 'Batido na hora',
        imageUrl: null,
        price: null,
        status: 'PUBLISHED',
        sizes: ACAI.sizes,
        optionGroups: [
          {
            id: ACAI.optionGroups[0]!.id,
            name: 'Adicionais',
            minChoices: 0,
            maxChoices: 3,
            options: ACAI.optionGroups[0]!.options,
          },
        ],
      },
    });
    // E é o que a API aceita.
    if (montagem.ok)
      expect(upsertStoreProductSchema.safeParse(montagem.payload).success).toBe(true);
  });

  it('linha nova vai sem id, e linha em branco não vai', () => {
    const estado = produtoParaFormulario(ACAI);
    estado.tamanhos.push(
      { chave: 'a', nome: '700ml', preco: '24,00', disponivel: true },
      { chave: 'b', nome: '', preco: '', disponivel: true },
    );
    estado.grupos[0]!.escolhas.push({ chave: 'c', nome: '  ', preco: '', disponivel: true });

    const montagem = montarPayload(estado, 'DRAFT');
    if (!montagem.ok) throw new Error(montagem.erros.join(' / '));
    expect(montagem.payload.sizes).toHaveLength(3);
    expect(montagem.payload.sizes[2]).toEqual({ name: '700ml', price: 24, available: true });
    expect(montagem.payload.optionGroups[0]!.options).toHaveLength(2);
  });

  it('rascunho aceita o trabalho pela metade: tamanho sem preço vai com zero', () => {
    const estado = vazio();
    estado.nome = 'Pizza';
    estado.tamanhos = [{ chave: 'a', nome: 'Grande', preco: '', disponivel: true }];

    const montagem = montarPayload(estado, 'DRAFT');
    if (!montagem.ok) throw new Error(montagem.erros.join(' / '));
    expect(montagem.payload.sizes).toEqual([{ name: 'Grande', price: 0, available: true }]);
    expect(montagem.payload.categoryId).toBeNull();
  });

  it('com a tabela de tamanhos aberta, o preço único não vai', () => {
    const estado = vazio();
    estado.nome = 'Suco';
    estado.precoUnico = '8,00';
    estado.tamanhos = [{ chave: 'a', nome: '', preco: '', disponivel: true }];

    const montagem = montarPayload(estado, 'DRAFT');
    if (!montagem.ok) throw new Error(montagem.erros.join(' / '));
    expect(montagem.payload.price).toBeNull();
    expect(montagem.payload.sizes).toEqual([]);
  });

  it('recusa o que a API não tem como guardar, dizendo onde', () => {
    const estado = vazio();
    estado.precoUnico = '12,5,0';
    estado.grupos = [
      {
        chave: 'g',
        nome: 'Borda',
        minimo: '2',
        maximo: '1',
        escolhas: [{ chave: 'e', nome: '', preco: '4,00', disponivel: true }],
      },
    ];

    const montagem = montarPayload(estado, 'DRAFT');
    expect(montagem.ok).toBe(false);
    if (montagem.ok) return;
    expect(montagem.erros).toEqual([
      'Dê um nome ao produto.',
      'Preço: "12,5,0" não é um valor. Use, por exemplo, 22,00.',
      'Em "Borda", o máximo é menor que o mínimo.',
      'Em "Borda", uma escolha tem preço, mas está sem nome.',
    ]);
  });

  it('preço acima do máximo da API é recusado antes de sair da tela', () => {
    const estado = vazio();
    estado.nome = 'Combo';
    estado.precoUnico = '100.000,00';
    const montagem = montarPayload(estado, 'DRAFT');
    expect(montagem).toEqual({
      ok: false,
      erros: ['Preço: o valor passa do máximo, R$ 99.999,99.'],
    });
  });

  it('máximo vazio é sem limite; zero não é', () => {
    const estado = vazio();
    estado.nome = 'Sorvete';
    estado.precoUnico = '10';
    estado.grupos = [{ chave: 'g', nome: 'Calda', minimo: '', maximo: '', escolhas: [] }];
    const livre = montarPayload(estado, 'DRAFT');
    if (!livre.ok) throw new Error(livre.erros.join(' / '));
    expect(livre.payload.optionGroups[0]).toMatchObject({ minChoices: 0, maxChoices: null });

    estado.grupos[0]!.maximo = '0';
    expect(montarPayload(estado, 'DRAFT')).toEqual({
      ok: false,
      erros: ['Em "Calda", o máximo tem de ser pelo menos 1 — ou fique vazio, sem limite.'],
    });
  });
});

describe('pendenciasDoFormulario', () => {
  it('formulário novo: sem nome, sem preço e sem categoria travam; o resto só recomenda', () => {
    const lista = pendenciasDoFormulario(vazio());
    expect(lista.filter((item) => item.blocking).map((item) => item.text)).toEqual([
      'sem nome',
      'sem preço',
      'sem categoria — não aparece em nenhuma seção da loja',
    ]);
    expect(lista.filter((item) => !item.blocking).map((item) => item.text)).toEqual([
      'sem foto',
      'sem descrição',
    ]);
  });

  it('preço digitado errado conta como sem preço', () => {
    const estado = produtoParaFormulario({ ...ACAI, sizes: [], price: 10 });
    estado.precoUnico = 'dez';
    expect(pendenciasDoFormulario(estado).map((item) => item.text)).toContain('sem preço');
  });

  it('grupo obrigatório sem escolha disponível trava a venda', () => {
    const estado = produtoParaFormulario(ACAI);
    estado.grupos[0]!.minimo = '1';
    estado.grupos[0]!.escolhas = estado.grupos[0]!.escolhas.map((escolha) => ({
      ...escolha,
      disponivel: false,
    }));
    expect(pendenciasDoFormulario(estado)).toContainEqual({
      text: '"Adicionais" exige 1 e só tem 0 disponíveis — o cliente não fecha o pedido',
      blocking: true,
    });
  });
});

describe('saidasDoFormulario', () => {
  const textos = (...args: Parameters<typeof saidasDoFormulario>) =>
    saidasDoFormulario(...args).map(
      (saida) => `${saida.texto} → ${saida.status}${saida.desativada ? ' (desativado)' : ''}`,
    );

  it('cadastro: publicar só sem pendência; rascunho sempre', () => {
    expect(textos(undefined, false)).toEqual([
      'Publicar produto → PUBLISHED',
      'Salvar rascunho → DRAFT',
    ]);
    expect(textos(undefined, true)).toEqual([
      'Publicar produto → PUBLISHED (desativado)',
      'Salvar rascunho → DRAFT',
    ]);
  });

  it('no ar, a edição que trava a venda sai do ar em vez de ficar quebrada', () => {
    expect(textos('PUBLISHED', false)).toEqual(['Salvar alterações → PUBLISHED']);
    expect(textos('PUBLISHED', true)).toEqual(['Salvar e tirar do ar → DRAFT']);
  });

  it('pausado continua pausado ao salvar', () => {
    expect(textos('PAUSED', false)).toEqual([
      'Salvar alterações → PAUSED',
      'Salvar e voltar a vender → PUBLISHED',
    ]);
    expect(textos('PAUSED', true)[1]).toBe('Salvar e voltar a vender → PUBLISHED (desativado)');
  });

  it('rascunho', () => {
    expect(textos('DRAFT', false)).toEqual([
      'Salvar e publicar → PUBLISHED',
      'Salvar rascunho → DRAFT',
    ]);
  });
});
