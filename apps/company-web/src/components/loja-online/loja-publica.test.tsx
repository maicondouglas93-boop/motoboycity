import { fireEvent, render, screen } from '@testing-library/react';
import type { OperacaoPublica } from '@motoboycity/types';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PorteiraDeLogin } from '@/components/loja-online/conta';
import { LojaPublica } from '@/components/loja-online/loja-publica';
import { paletaDoTema } from '@/components/loja-online/paleta';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';
import type { CardapioDaPagina } from '@/lib/loja-publica';

/**
 * A loja de verdade na página do cliente: o cardápio publicado, o horário e a
 * situação dela, e nada que dê a entender que dá para pedir — o pedido ainda
 * não chega à loja.
 */

// Nos testes não há configuração do Firebase — é o caso de produção antes de
// ela existir. Se algum componente tentar usar o login mesmo assim, o teste
// acusa.
vi.mock('@/lib/firebase-da-loja', () => {
  const proibido = () => {
    throw new Error('Login do Firebase usado sem configuração');
  };
  return {
    aoMudarOCliente: proibido,
    entrarComGoogle: proibido,
    sair: proibido,
    tokenDoCliente: proibido,
  };
});

beforeAll(() => {
  // O jsdom não tem estes; a barra de categorias, a sacola e o movimento usam.
  HTMLElement.prototype.scrollTo = () => {};
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  window.matchMedia ??= ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Uma quarta-feira, na hora da loja (Brasília, UTC-3). */
function naQuarta(horaNaLoja: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`2026-09-23T${horaNaLoja}:00-03:00`));
}

/**
 * Do banco: todo dia das 11h às 14h, com recado para quando está fechada, dois
 * bairros e pagamento na entrega.
 */
const OPERACAO: OperacaoPublica = {
  funcionamento: {
    semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      dia,
      faixas: [{ abre: '11:00', fecha: '14:00' }],
    })),
    excecoes: [],
    ajuste: null,
    mensagemFechada: 'Voltamos amanhã no almoço.',
  },
  recebimento: OPERACAO_DE_EXEMPLO.recebimento,
  entrega: OPERACAO_DE_EXEMPLO.entrega,
  retirada: OPERACAO_DE_EXEMPLO.retirada,
  agendamento: OPERACAO_DE_EXEMPLO.agendamento,
  pagamentos: ['DINHEIRO', 'DEBITO_MAQUININHA'],
  bairros: [
    { id: 'b1', nome: 'Centro', taxa: 6 },
    { id: 'b2', nome: 'Vila Nova', taxa: 9 },
  ],
};

const VITRINE: CardapioDaPagina = {
  vitrine: true,
  identidade: {
    nome: 'Lanches do Zé',
    tema: 'CLARO',
    corDaMarca: '#c2410c',
    corDeAcao: '#15803d',
    logoUrl: null,
  },
  categorias: [{ id: 'c1', nome: 'Lanches' }],
  produtos: [
    {
      id: 'p1',
      nome: 'X-Burger',
      descricao: 'Pão, carne e queijo',
      categoriaId: 'c1',
      imagemUrl: null,
      precoUnico: 22,
      situacao: 'publicado',
      tamanhos: [],
      grupos: [],
    },
  ],
  operacao: OPERACAO,
  enderecoDeRetirada: null,
  promocoes: [],
  destaques: [],
};

describe('Loja pública — vitrine', () => {
  it('mostra o cardápio e a situação da loja, e diz que ainda não recebe pedido', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lanches do Zé');
    expect(screen.getByText('Aberto até 14:00')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Esta loja ainda não recebe pedidos por aqui.',
    );
    expect(screen.getByText('X-Burger')).toBeInTheDocument();
    // O tempo, a taxa dos bairros e as formas de pagamento são os dela.
    expect(screen.getByText('35 a 50 min')).toBeInTheDocument();
    expect(screen.getByText('R$ 6,00 a R$ 9,00')).toBeInTheDocument();
    expect(screen.getByText('Retirada sem taxa')).toBeInTheDocument();
    expect(screen.getByText('Na entrega: dinheiro, débito')).toBeInTheDocument();
    expect(screen.queryByText(/Online:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Meus pedidos')).not.toBeInTheDocument();
  });

  it('com logo, a logo entra no lugar da inicial', () => {
    naQuarta('12:00');
    const { container } = render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{
          ...VITRINE,
          identidade: { ...VITRINE.identidade, logoUrl: 'https://ik.imagekit.io/x/logo.png' },
        }}
      />,
    );
    expect(container.querySelector('header img')).toHaveAttribute(
      'src',
      'https://ik.imagekit.io/x/logo.png',
    );
  });

  it('sem bairro cadastrado, não inventa taxa', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{ ...VITRINE, operacao: { ...OPERACAO, bairros: [] } }}
      />,
    );
    // "Entrega", sem valor: a taxa só existe por bairro.
    expect(screen.getByText('Entrega')).toBeInTheDocument();
    expect(screen.queryByText('a combinar')).not.toBeInTheDocument();
  });

  it('fechada, diz quando abre e mostra o recado, sem prometer pedido', () => {
    naQuarta('20:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    const [fechada, vitrine] = screen.getAllByRole('status');
    expect(fechada).toHaveTextContent('Fechado · abre amanhã às 11:00');
    expect(fechada).toHaveTextContent('Voltamos amanhã no almoço.');
    expect(fechada).not.toHaveTextContent(/pedir|agendar/);
    expect(vitrine).toHaveTextContent('Esta loja ainda não recebe pedidos por aqui.');
  });

  it('pausada pelo painel, mostra quando os pedidos voltam', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{
          ...VITRINE,
          operacao: {
            ...OPERACAO,
            funcionamento: {
              ...OPERACAO.funcionamento,
              ajuste: {
                estado: 'PAUSADA',
                desde: '2026-09-23T11:50:00-03:00',
                ate: '2026-09-23T12:30:00-03:00',
              },
            },
          },
        }}
      />,
    );

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Pedidos pausados · voltam às 12:30',
    );
  });

  it('o produto abre, mas o botão não deixa pedir', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    fireEvent.click(screen.getByText('X-Burger'));

    // O nome do botão leva o preço junto: "Pedidos em breve R$ 22,00".
    expect(screen.getByRole('button', { name: /Pedidos em breve/ })).toBeDisabled();
  });
});

describe('Loja pública — sem a configuração do login', () => {
  it('a demonstração abre sem conta, e a sacola diz que ainda não dá para pedir', () => {
    render(
      <LojaPublica
        slug="minha-loja"
        cardapio={{
          ...VITRINE,
          vitrine: false,
          identidade: { ...VITRINE.identidade, nome: 'Demo' },
          operacao: null,
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Demo');
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('a porteira da sacola não oferece login que não existe', () => {
    render(
      <PorteiraDeLogin
        paleta={paletaDoTema('CLARO')}
        corDeAcao="#15803d"
        textoDoBotao="Entrar e pedir"
        resumo="Seu pedido de R$ 22,00 está aqui."
      />,
    );
    expect(screen.getByText('Pedidos por aqui em breve')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar e pedir' })).not.toBeInTheDocument();
  });
});

describe('Loja pública — promoções no cardápio', () => {
  const promocao = {
    id: 'promo-1',
    nome: 'X-Burger 20%',
    tipo: 'PERCENTUAL',
    alvo: 'PRODUTO',
    produtoId: 'p1',
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
  } as const;

  it('o produto em promoção mostra o preço de antes riscado, o de agora e o selo', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{ ...VITRINE, promocoes: [{ ...promocao, diasDaSemana: [] }] }}
      />,
    );

    expect(screen.getByText('R$ 22,00').tagName).toBe('S');
    expect(screen.getByText('R$ 17,60')).toBeInTheDocument();
    expect(screen.getByText('20% OFF')).toBeInTheDocument();
  });

  it('a promoção de outro dia da semana não aparece', () => {
    // A quarta é o dia 3; a promoção é só de sexta e sábado.
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{ ...VITRINE, promocoes: [{ ...promocao, diasDaSemana: [5, 6] }] }}
      />,
    );

    expect(screen.getByText('R$ 22,00').tagName).not.toBe('S');
    expect(screen.queryByText('20% OFF')).not.toBeInTheDocument();
  });

  it('sem promoção o cardápio é o de sempre', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={VITRINE} />);

    expect(screen.getByText('R$ 22,00').tagName).not.toBe('S');
  });
});

describe('Loja pública — destaques no alto do cardápio', () => {
  const destaque = (mudancas: Partial<CardapioDaPagina['destaques'][number]> = {}) => ({
    id: 'd1',
    titulo: 'Mais pedidos',
    produtoIds: ['p1'],
    inicio: null,
    fim: null,
    ...mudancas,
  });
  const comDestaques = (destaques: CardapioDaPagina['destaques']): CardapioDaPagina => ({
    ...VITRINE,
    destaques,
  });

  it('mostra o bloco com o título, o produto escolhido e o chip "Destaques" na barra', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comDestaques([destaque()])} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Mais pedidos' })).toBeInTheDocument();
    // O produto aparece no destaque e na lista: duas vezes.
    expect(screen.getAllByText('X-Burger')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Destaques' })).toHaveAttribute(
      'href',
      '#secao-destaques',
    );
    expect(document.getElementById('secao-destaques')).not.toBeNull();
  });

  it('sem destaque, o cardápio é o de sempre, sem chip nem bloco', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comDestaques([])} />);

    expect(screen.getAllByText('X-Burger')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Destaques' })).not.toBeInTheDocument();
    expect(document.getElementById('secao-destaques')).toBeNull();
  });

  it('o destaque cujo produto não está à venda não aparece', () => {
    naQuarta('12:00');
    const pausado = comDestaques([destaque({ produtoIds: ['p1'] })]);
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{
          ...pausado,
          produtos: pausado.produtos.map((produto) => ({ ...produto, situacao: 'pausado' })),
        }}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Mais pedidos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Destaques' })).not.toBeInTheDocument();
  });

  it('fora das datas some: o que já acabou e o que ainda não começou', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comDestaques([
          destaque({ id: 'a', titulo: 'Acabou', fim: '2026-09-22' }),
          destaque({ id: 'b', titulo: 'Vem aí', inicio: '2026-09-24' }),
          destaque({ id: 'c', titulo: 'Hoje', inicio: '2026-09-23', fim: '2026-09-23' }),
        ])}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acabou' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vem aí' })).not.toBeInTheDocument();
  });

  it('respeita a ordem da loja entre os destaques', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comDestaques([
          destaque({ id: 'a', titulo: 'Segundo da lista?' }),
          destaque({ id: 'b', titulo: 'Novidades' }),
        ])}
      />,
    );

    const titulos = screen
      .getAllByRole('heading', { level: 2 })
      .map((titulo) => titulo.textContent)
      .filter((texto) => texto === 'Segundo da lista?' || texto === 'Novidades');
    expect(titulos).toEqual(['Segundo da lista?', 'Novidades']);
  });

  it('o produto em destaque mostra a promoção que ele já tem, pela mesma regra da lista', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={{
          ...comDestaques([destaque()]),
          promocoes: [
            {
              id: 'promo-1',
              nome: 'X-Burger 20%',
              tipo: 'PERCENTUAL',
              alvo: 'PRODUTO',
              produtoId: 'p1',
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
            },
          ],
        }}
      />,
    );

    // No destaque e na lista: o preço de antes riscado, o de agora, e o selo, duas vezes cada.
    expect(screen.getAllByText('R$ 22,00').map((preco) => preco.tagName)).toEqual(['S', 'S']);
    expect(screen.getAllByText('R$ 17,60')).toHaveLength(2);
    expect(screen.getAllByText('20% OFF')).toHaveLength(2);
  });

  it('tocar no cartão abre a folha do produto', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comDestaques([destaque()])} />);

    const cartao = screen.getAllByRole('button', { name: /X-Burger/ })[0]!;
    fireEvent.click(cartao);

    // A folha do produto abriu: numa vitrine, o botão dela diz que os pedidos vêm em breve.
    expect(screen.getByRole('button', { name: /Pedidos em breve/ })).toBeInTheDocument();
  });
});

describe('Loja pública — estoque', () => {
  const comEstoque = (
    estoque: { esgotado?: boolean; restam?: number | null },
    mudancas: Partial<CardapioDaPagina> = {},
  ): CardapioDaPagina => ({
    ...VITRINE,
    produtos: VITRINE.produtos.map((produto) => ({ ...produto, ...estoque })),
    ...mudancas,
  });

  it('o produto esgotado continua no cardápio, com "Esgotado" no lugar do preço', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comEstoque({ esgotado: true })} />);

    expect(screen.getByText('X-Burger')).toBeInTheDocument();
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
    expect(screen.queryByText('R$ 22,00')).not.toBeInTheDocument();
  });

  it('com poucas unidades, a linha diz quantas restam, e o preço segue à mostra', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comEstoque({ restam: 3 })} />);

    expect(screen.getByText('R$ 22,00')).toBeInTheDocument();
    expect(screen.getByText('Restam 3 unidades')).toBeInTheDocument();
    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
  });

  it('uma unidade só usa o singular', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comEstoque({ restam: 1 })} />);

    expect(screen.getByText('Resta 1 unidade')).toBeInTheDocument();
  });

  it('sem controle de estoque, a linha é a de sempre', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comEstoque({})} />);

    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
    expect(screen.queryByText(/Restam?\s/)).not.toBeInTheDocument();
  });

  it('a folha do produto esgotado mostra "Esgotado" e não deixa adicionar', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comEstoque({ esgotado: true }, { vitrine: false })}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /X-Burger/ })[0]!);

    const adicionar = screen.getByRole('button', { name: /^Esgotado/ });
    expect(adicionar).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Adicionar/ })).not.toBeInTheDocument();
  });

  it('a folha do produto com poucas unidades não deixa passar do que resta', () => {
    naQuarta('12:00');
    render(
      <LojaPublica slug="lanches-do-ze" cardapio={comEstoque({ restam: 2 }, { vitrine: false })} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /X-Burger/ })[0]!);
    expect(screen.getAllByText('Restam 2 unidades').length).toBeGreaterThan(0);

    const mais = screen.getByRole('button', { name: 'Mais um' });
    fireEvent.click(mais);
    // Dois é tudo o que há: o botão trava, e a quantidade não passa.
    expect(mais).toBeDisabled();
    expect(screen.getByText('2', { selector: 'span.w-5' })).toBeInTheDocument();
    fireEvent.click(mais);
    expect(screen.getByText('2', { selector: 'span.w-5' })).toBeInTheDocument();
  });

  it('depois de pôr tudo o que resta na sacola, o produto não aceita mais, na folha nem na sacola', () => {
    window.localStorage.clear();
    naQuarta('12:00');
    render(
      <LojaPublica slug="lanches-do-ze" cardapio={comEstoque({ restam: 2 }, { vitrine: false })} />,
    );

    // Põe as duas unidades.
    fireEvent.click(screen.getAllByRole('button', { name: /X-Burger/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar/ }));

    // Abre o produto de novo: já está tudo na sacola.
    fireEvent.click(screen.getAllByRole('button', { name: /X-Burger/ })[0]!);
    expect(
      screen.getByRole('button', { name: /Todas as unidades já estão na sacola/ }),
    ).toBeDisabled();

    // E na folha da sacola o "mais" travou.
    fireEvent.click(screen.getByRole('button', { name: /Ver sacola/ }));
    expect(screen.getByRole('button', { name: 'Mais um X-Burger' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Menos um X-Burger' })).toBeEnabled();
  });

  it('o produto esgotado não é promovido no destaque', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comEstoque(
          { esgotado: true },
          {
            destaques: [
              { id: 'd1', titulo: 'Mais pedidos', produtoIds: ['p1'], inicio: null, fim: null },
            ],
          },
        )}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Mais pedidos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Destaques' })).not.toBeInTheDocument();
    // Mas continua na lista, como esgotado.
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
  });

  it('o destaque com produto de poucas unidades mostra quantas restam no cartão', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comEstoque(
          { restam: 4 },
          {
            destaques: [
              { id: 'd1', titulo: 'Mais pedidos', produtoIds: ['p1'], inicio: null, fim: null },
            ],
          },
        )}
      />,
    );

    // No cartão do destaque (curto) e na linha da lista.
    expect(screen.getByText('Restam 4')).toBeInTheDocument();
    expect(screen.getByText('Restam 4 unidades')).toBeInTheDocument();
  });
});

describe('Loja pública — combos', () => {
  const COMBO: CardapioDaPagina['produtos'][number] = {
    id: 'cb1',
    nome: 'Combo X-Burger',
    descricao: 'O clássico da casa',
    categoriaId: 'c1',
    imagemUrl: null,
    precoUnico: 30,
    situacao: 'publicado',
    tamanhos: [],
    grupos: [],
    combo: {
      itens: [
        { produtoId: 'p1', nome: 'X-Burger', tamanho: null, quantidade: 1 },
        { produtoId: 'p3', nome: 'Batata', tamanho: 'Média', quantidade: 1 },
        { produtoId: 'p4', nome: 'Refrigerante', tamanho: null, quantidade: 1 },
      ],
      // Separados: 22 + 12 + 7 = 41.
      valorSeparado: 41,
    },
  };
  const comCombo = (
    combo: Partial<typeof COMBO> = {},
    mudancas: Partial<CardapioDaPagina> = {},
  ): CardapioDaPagina => ({
    ...VITRINE,
    vitrine: false,
    produtos: [...VITRINE.produtos, { ...COMBO, ...combo }],
    ...mudancas,
  });
  const INCLUI = '1× X-Burger, 1× Batata (Média), 1× Refrigerante';

  it('a linha do combo diz o que ele leva e quanto o cliente economiza, com o preço do combo', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comCombo()} />);

    expect(screen.getByText(`Inclui: ${INCLUI}`)).toBeInTheDocument();
    expect(screen.getByText('Economize R$ 11,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
    // O produto comum da mesma lista continua sem nada disso.
    expect(screen.getAllByText(/Inclui:/)).toHaveLength(1);
  });

  it('sem economia — o combo no mesmo preço dos itens separados —, a linha não fala em economia', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comCombo({ combo: { ...COMBO.combo!, valorSeparado: 30 } })}
      />,
    );

    expect(screen.getByText(`Inclui: ${INCLUI}`)).toBeInTheDocument();
    expect(screen.queryByText(/Economize/)).not.toBeInTheDocument();
  });

  it('a folha do combo lista os itens e a economia', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comCombo()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Combo X-Burger/ })[0]!);

    expect(screen.getByText('O combo inclui')).toBeInTheDocument();
    expect(screen.getByText('1× Batata (Média)')).toBeInTheDocument();
    expect(screen.getByText('1× Refrigerante')).toBeInTheDocument();
    expect(screen.getByText('Você economiza R$ 11,00')).toBeInTheDocument();
  });

  it('o combo vai para a sacola pelo preço dele, e a sacola diz o que ele leva', () => {
    window.localStorage.clear();
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comCombo()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Combo X-Burger/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ver sacola/ }));

    // Uma vez na linha do cardápio, atrás, e outra na sacola.
    expect(screen.getAllByText(`Inclui: ${INCLUI}`)).toHaveLength(2);
    expect(screen.getAllByText('R$ 30,00').length).toBeGreaterThan(0);
  });

  it('o combo esgotado — falta um produto dele — dá para ver e não dá para pedir', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comCombo({ esgotado: true })} />);

    expect(screen.getByText('Esgotado')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Combo X-Burger/ })[0]!);
    expect(screen.getByRole('button', { name: /^Esgotado/ })).toBeDisabled();
  });

  it('com poucas unidades, o combo diz quantos restam', () => {
    naQuarta('12:00');
    render(<LojaPublica slug="lanches-do-ze" cardapio={comCombo({ restam: 2 })} />);

    expect(screen.getByText('Restam 2 unidades')).toBeInTheDocument();
  });

  it('a promoção da seção baixa o produto, mas o combo da mesma seção fica pelo preço dele', () => {
    naQuarta('12:00');
    render(
      <LojaPublica
        slug="lanches-do-ze"
        cardapio={comCombo(
          {},
          {
            promocoes: [
              {
                id: 'promo-1',
                nome: 'Lanches 50%',
                tipo: 'PERCENTUAL',
                alvo: 'CATEGORIA',
                produtoId: null,
                categoriaId: 'c1',
                percentual: 50,
                precoPromocional: null,
                leve: null,
                pague: null,
                inicio: null,
                fim: null,
                horaInicio: null,
                horaFim: null,
                diasDaSemana: [],
              },
            ],
          },
        )}
      />,
    );

    // Só o X-Burger leva o selo e o "De / Por"; o combo mantém o preço.
    expect(screen.getAllByText('50% OFF')).toHaveLength(1);
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
  });
});
