import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@motoboycity/api-client';
import type {
  CupomDisponivel,
  CupomPublico,
  OperacaoPublica,
  PedidoDaLoja,
} from '@motoboycity/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sacola } from '@/app/(loja)/pedir/[slug]/sacola/sacola';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';
import type { CardapioDaPagina } from '@/lib/loja-publica';

/**
 * A sacola da loja de verdade: o pedido vai para a API com os ids do que foi
 * escolhido e o total que o cliente viu, e a recusa do servidor aparece na
 * tela com a frase dele.
 */

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  conferirCupom: vi.fn(),
  cuponsDisponiveis: vi.fn(),
  pedidos: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/conta-da-loja', () => ({
  CONTA_DISPONIVEL: true,
  CONFIGURACAO_DO_FIREBASE: { apiKey: 'x', authDomain: 'x', projectId: 'x', appId: 'x' },
}));
vi.mock('@/lib/firebase-da-loja', () => ({
  aoMudarOCliente: (ouvinte: (usuario: unknown) => void) => {
    ouvinte({ uid: 'user_1', displayName: 'Ana', photoURL: null });
    return () => {};
  },
  entrarComGoogle: vi.fn(),
  sair: vi.fn(),
  tokenDoCliente: () => Promise.resolve('token-do-google'),
}));
vi.mock('@/lib/api-client', () => ({
  publicStoreOrdersApi: {
    checkout: mocks.checkout,
    conferirCupom: mocks.conferirCupom,
    cuponsDisponiveis: mocks.cuponsDisponiveis,
    pedidos: mocks.pedidos,
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

const SLUG = 'lanches-do-ze';

beforeAll(() => {
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

const OPERACAO: OperacaoPublica = {
  funcionamento: {
    semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
      dia,
      faixas: [{ abre: '11:00', fecha: '14:00' }],
    })),
    excecoes: [],
    ajuste: null,
    mensagemFechada: '',
  },
  recebimento: OPERACAO_DE_EXEMPLO.recebimento,
  entrega: { ...OPERACAO_DE_EXEMPLO.entrega, pedidoMinimo: null },
  retirada: { ...OPERACAO_DE_EXEMPLO.retirada, ativa: false },
  agendamento: { ...OPERACAO_DE_EXEMPLO.agendamento, permitir: false },
  pagamentos: ['DINHEIRO'],
  bairros: [{ id: 'b1', nome: 'Centro', taxa: 5 }],
};

function cardapio(mudancas: Partial<CardapioDaPagina> = {}): CardapioDaPagina {
  return {
    vitrine: false,
    identidade: {
      nome: 'Lanches do Zé',
      tema: 'CLARO',
      corDaMarca: '#c2410c',
      corDeAcao: '#15803d',
      logoUrl: null,
    },
    categorias: [],
    produtos: [],
    operacao: OPERACAO,
    enderecoDeRetirada: null,
    promocoes: [],
    destaques: [],
    ...mudancas,
  };
}

beforeEach(() => {
  // Sem cupom na lista, salvo nos testes que a preenchem.
  mocks.cuponsDisponiveis.mockReset();
  mocks.cuponsDisponiveis.mockResolvedValue([]);
  vi.useFakeTimers({ toFake: ['Date'] });
  // Quarta, meio-dia: a loja está aberta.
  vi.setSystemTime(new Date('2026-09-23T12:00:00-03:00'));
  window.localStorage.clear();
  window.localStorage.setItem(
    `loja:${SLUG}:sacola`,
    JSON.stringify([
      {
        produtoId: 'p1',
        nome: 'Açaí',
        tamanho: '500ml',
        escolhas: ['Morango'],
        tamanhoId: 't1',
        escolhaIds: ['e1'],
        quantidade: 2,
        unitario: 21,
      },
    ]),
  );
  // O cliente já pediu antes: o formulário nasce preenchido pela conta.
  window.localStorage.setItem(
    `loja:${SLUG}:user_1:cliente`,
    JSON.stringify({
      nome: 'Ana',
      telefone: '33999887766',
      entrega: {
        rua: 'Rua A',
        numero: '10',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Lajinha',
        estado: 'MG',
        cep: '',
        referencia: null,
      },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

/** 10% em tudo, sem limite: o cupom mais simples. */
function cupomDe(mudancas: Partial<CupomPublico> = {}): CupomPublico {
  return {
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
  };
}

describe('Cupom no checkout', () => {
  /** Abre o campo, digita o código e toca em "Aplicar". */
  async function aplicar(codigo = 'bemvindo10') {
    fireEvent.click(await screen.findByRole('button', { name: 'Tem um código de cupom?' }));
    fireEvent.change(screen.getByLabelText('Código do cupom'), { target: { value: codigo } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  }

  it('aplica: confere no servidor com a sacola, mostra o desconto, e o pedido leva o total com ele', async () => {
    mocks.conferirCupom.mockResolvedValue({ cupom: cupomDe(), desconto: 4.2 });
    mocks.checkout.mockResolvedValue({ numero: 20 } as PedidoDaLoja);
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    await aplicar();

    // O código vai em maiúsculas, com a sacola por ids: o servidor refaz a conta.
    await waitFor(() =>
      expect(mocks.conferirCupom).toHaveBeenCalledWith(SLUG, 'token-do-google', {
        cupom: 'BEMVINDO10',
        itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1'], quantidade: 2 }],
      }),
    );
    // 2 x 21,00 = 42,00; 10% = 4,20; mais 5,00 de entrega = 42,80.
    expect(await screen.findByText('Cupom BEMVINDO10', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('− R$ 4,20')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ cupom: 'BEMVINDO10', totalVisto: 42.8 }),
      ),
    );
  });

  it('sem cupom aplicado, o pedido vai sem cupom e com o total de sempre', async () => {
    mocks.checkout.mockResolvedValue({ numero: 21 } as PedidoDaLoja);
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ cupom: null, totalVisto: 47 }),
      ),
    );
    expect(mocks.conferirCupom).not.toHaveBeenCalled();
  });

  it('o servidor recusa o código: a frase dele aparece no campo, e nenhum cupom fica aplicado', async () => {
    mocks.conferirCupom.mockRejectedValue(
      new ApiError(409, {
        message: 'Este cupom venceu em 01/09/2026.',
        code: 'STORE_COUPON_EXPIRED',
      }),
    );
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    await aplicar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Este cupom venceu em 01/09/2026.');
    expect(screen.queryByText('Remover')).not.toBeInTheDocument();
  });

  it('código em branco pede o código, sem ir ao servidor', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    await aplicar('');

    expect(await screen.findByRole('alert')).toHaveTextContent('Digite o código do cupom.');
    expect(mocks.conferirCupom).not.toHaveBeenCalled();
  });

  it('remover tira o desconto e volta ao total sem cupom', async () => {
    mocks.conferirCupom.mockResolvedValue({ cupom: cupomDe(), desconto: 4.2 });
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);
    await aplicar();
    expect(await screen.findByText('− R$ 4,20')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    expect(screen.queryByText('− R$ 4,20')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tem um código de cupom?' })).toBeInTheDocument();
  });

  it('a sacola que não serve ao cupom (pedido mínimo) mostra o motivo, sem desconto, e o pedido vai sem cupom', async () => {
    mocks.conferirCupom.mockResolvedValue({ cupom: cupomDe({ pedidoMinimo: 100 }), desconto: 0 });
    mocks.checkout.mockResolvedValue({ numero: 22 } as PedidoDaLoja);
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    await aplicar();

    expect(
      await screen.findByText(
        'Faltam R$ 58,00 em itens para usar este cupom (pedido mínimo de R$ 100,00).',
      ),
    ).toBeInTheDocument();
    // O cupom continua aplicado (com a frase), mas o desconto é zero.
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
    expect(screen.queryByText(/− R\$ /)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ cupom: null, totalVisto: 47 }),
      ),
    );
  });

  it('o servidor recusa o cupom na hora do pedido: ele sai da sacola e a frase aparece', async () => {
    mocks.conferirCupom.mockResolvedValue({ cupom: cupomDe(), desconto: 4.2 });
    mocks.checkout.mockRejectedValue(
      new ApiError(409, {
        message: 'Este cupom já foi usado todas as vezes.',
        code: 'STORE_COUPON_EXHAUSTED',
      }),
    );
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);
    await aplicar();
    expect(await screen.findByText('− R$ 4,20')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    expect(await screen.findByText('Este cupom já foi usado todas as vezes.')).toBeInTheDocument();
    // O cupom saiu, e o total voltou ao de sempre: o cliente pode pedir sem ele.
    expect(screen.queryByText('− R$ 4,20')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tem um código de cupom?' })).toBeInTheDocument();
  });

  it('na loja de demonstração não há cupom', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio({ operacao: null })} />);

    await screen.findByRole('heading', { name: 'Finalizar pedido' });
    expect(
      screen.queryByRole('button', { name: 'Tem um código de cupom?' }),
    ).not.toBeInTheDocument();
  });
});

/** Um cupom da lista do checkout: as regras e o último dia. */
function disponivel(mudancas: Partial<CupomDisponivel> = {}): CupomDisponivel {
  return { ...cupomDe(), fim: null, ...mudancas };
}

describe('A área "Cupons" do checkout', () => {
  const abrir = () => render(<Sacola slug={SLUG} cardapio={cardapio()} />);

  it('lista os cupons disponíveis, com o que cada um faz e o que dá a esta sacola', async () => {
    mocks.cuponsDisponiveis.mockResolvedValue([
      disponivel({ pedidoMinimo: 30, fim: '2026-10-31' }),
    ]);
    abrir();

    expect(await screen.findByRole('heading', { name: 'Cupons' })).toBeInTheDocument();
    expect(await screen.findByText('BEMVINDO10')).toBeInTheDocument();
    expect(screen.getByText('10% de desconto')).toBeInTheDocument();
    // 2 x 21,00 = 42,00; 10% = 4,20.
    expect(screen.getByText('Você economiza R$ 4,20 nesta sacola')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Pedido mínimo de R$ 30,00 · Não vale em itens em promoção · Válido até 31/10/2026',
      ),
    ).toBeInTheDocument();
    expect(mocks.cuponsDisponiveis).toHaveBeenCalledWith(SLUG, 'token-do-google');
  });

  it('um toque em "Aplicar" confere no servidor e aplica: o total já vai com o desconto', async () => {
    mocks.cuponsDisponiveis.mockResolvedValue([disponivel()]);
    mocks.conferirCupom.mockResolvedValue({ cupom: cupomDe(), desconto: 4.2 });
    mocks.checkout.mockResolvedValue({ numero: 30 } as PedidoDaLoja);
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar o cupom BEMVINDO10' }));

    await waitFor(() =>
      expect(mocks.conferirCupom).toHaveBeenCalledWith(SLUG, 'token-do-google', {
        cupom: 'BEMVINDO10',
        itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1'], quantidade: 2 }],
      }),
    );
    // Aplicado, a lista some e a linha do cupom entra, com o desconto no total.
    expect(await screen.findByText('− R$ 4,20')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cupons' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));
    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ cupom: 'BEMVINDO10', totalVisto: 42.8 }),
      ),
    );
  });

  it('o cupom que não serve a esta sacola aparece com o motivo, e o botão não deixa aplicar', async () => {
    mocks.cuponsDisponiveis.mockResolvedValue([disponivel({ pedidoMinimo: 100 })]);
    abrir();

    expect(
      await screen.findByText(
        'Faltam R$ 58,00 em itens para usar este cupom (pedido mínimo de R$ 100,00).',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar o cupom BEMVINDO10' })).toBeDisabled();
    expect(screen.queryByText(/Você economiza/)).not.toBeInTheDocument();
  });

  it('os que servem vêm primeiro, do maior desconto ao menor, e o melhor vem marcado', async () => {
    mocks.cuponsDisponiveis.mockResolvedValue([
      disponivel({ codigo: 'FRETE5', tipo: 'VALOR', percentual: null, valor: 5 }),
      disponivel({ codigo: 'GRANDE100', pedidoMinimo: 500 }),
      disponivel({ codigo: 'VINTE', percentual: 20 }),
    ]);
    abrir();

    await screen.findByText('VINTE');
    const codigos = screen
      .getAllByRole('button', { name: /^Aplicar o cupom / })
      .map((botao) => (botao.getAttribute('aria-label') ?? '').replace('Aplicar o cupom ', ''));
    // 20% de 42,00 = 8,40; R$ 5,00; e o de mínimo alto, que não serve, por último.
    expect(codigos).toEqual(['VINTE', 'FRETE5', 'GRANDE100']);
    expect(screen.getAllByText('Melhor desconto')).toHaveLength(1);
    expect(screen.getByText('Você economiza R$ 8,40 nesta sacola')).toBeInTheDocument();
  });

  it('com um cupom só que serve, ele não leva o selo de "melhor"', async () => {
    mocks.cuponsDisponiveis.mockResolvedValue([disponivel()]);
    abrir();

    await screen.findByText('BEMVINDO10');
    expect(screen.queryByText('Melhor desconto')).not.toBeInTheDocument();
  });

  it('sem cupom disponível, diz isso, e o código digitado continua ao alcance', async () => {
    abrir();

    expect(await screen.findByText('Nenhum cupom disponível no momento.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tem um código de cupom?' })).toBeInTheDocument();
  });

  it('enquanto procura, avisa; se a lista não carrega, diz sem alarme e deixa digitar o código', async () => {
    mocks.cuponsDisponiveis.mockRejectedValue(new Error('sem rede'));
    abrir();

    expect(
      await screen.findByText('Não deu para carregar a lista de cupons agora.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tem um código de cupom?' })).toBeInTheDocument();
  });

  it('o servidor recusa o cupom do cartão (acabou nesse meio tempo): a frase dele aparece', async () => {
    mocks.cuponsDisponiveis.mockResolvedValue([disponivel()]);
    mocks.conferirCupom.mockRejectedValue(
      new ApiError(409, {
        message: 'Este cupom já foi usado todas as vezes.',
        code: 'STORE_COUPON_EXHAUSTED',
      }),
    );
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar o cupom BEMVINDO10' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este cupom já foi usado todas as vezes.',
    );
    expect(screen.queryByText('Remover')).not.toBeInTheDocument();
  });

  it('remover o cupom aplicado devolve a lista, relida do servidor', async () => {
    mocks.cuponsDisponiveis.mockResolvedValueOnce([disponivel()]).mockResolvedValue([]);
    mocks.conferirCupom.mockResolvedValue({ cupom: cupomDe(), desconto: 4.2 });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar o cupom BEMVINDO10' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));

    // Relida: o cupom que acabou de sair não volta se o servidor já não o lista.
    expect(await screen.findByText('Nenhum cupom disponível no momento.')).toBeInTheDocument();
    expect(mocks.cuponsDisponiveis).toHaveBeenCalledTimes(2);
  });

  it('digitar o código de um cupom secreto continua funcionando', async () => {
    mocks.conferirCupom.mockResolvedValue({
      cupom: cupomDe({ codigo: 'CONVITE20' }),
      desconto: 4.2,
    });
    abrir();

    fireEvent.click(await screen.findByRole('button', { name: 'Tem um código de cupom?' }));
    fireEvent.change(screen.getByLabelText('Código do cupom'), { target: { value: 'convite20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() =>
      expect(mocks.conferirCupom).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ cupom: 'CONVITE20' }),
      ),
    );
    expect(await screen.findByText('Cupom CONVITE20', { selector: 'span' })).toBeInTheDocument();
  });

  it('na loja de demonstração não há área de cupons, nem chamada ao servidor', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio({ operacao: null })} />);

    await screen.findByRole('heading', { name: 'Finalizar pedido' });
    expect(screen.queryByRole('heading', { name: 'Cupons' })).not.toBeInTheDocument();
    expect(mocks.cuponsDisponiveis).not.toHaveBeenCalled();
  });
});

describe('Estoque na sacola', () => {
  /** O açaí da sacola de teste (p1, tamanho t1), como a página sabe do estoque. */
  const acai = (estoque: { esgotado?: boolean; restam?: number | null }) => ({
    id: 'p1',
    nome: 'Açaí',
    descricao: '',
    categoriaId: 'c1',
    imagemUrl: null,
    precoUnico: null,
    situacao: 'publicado' as const,
    tamanhos: [{ id: 't1', nome: '500ml', preco: 18, disponivel: true }],
    grupos: [],
    ...estoque,
  });
  const abrir = (estoque: { esgotado?: boolean; restam?: number | null }) =>
    render(<Sacola slug={SLUG} cardapio={cardapio({ produtos: [acai(estoque)] })} />);

  it('o produto que esgotou depois de entrar na sacola avisa, e não deixa aumentar', async () => {
    abrir({ esgotado: true });

    expect(
      await screen.findByText('Açaí esgotou. Tire da sacola para continuar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mais um Açaí' })).toBeDisabled();
  });

  it('a sacola com mais do que resta avisa quantas restam', async () => {
    // A sacola de teste tem 2 unidades; restam 1.
    abrir({ restam: 1 });

    expect(
      await screen.findByText('Só resta 1 unidade de Açaí. Diminua a quantidade.'),
    ).toBeInTheDocument();
  });

  it('no limite do que resta, o "mais" trava, mas não há aviso: a sacola cabe', async () => {
    abrir({ restam: 2 });

    const mais = await screen.findByRole('button', { name: 'Mais um Açaí' });
    expect(mais).toBeDisabled();
    expect(screen.queryByText(/Só restam?/)).not.toBeInTheDocument();
    expect(screen.queryByText(/esgotou/)).not.toBeInTheDocument();
  });

  it('sem controle de estoque, nada muda: dá para aumentar, e não há aviso', async () => {
    abrir({});

    expect(await screen.findByRole('button', { name: 'Mais um Açaí' })).toBeEnabled();
    expect(screen.queryByText(/esgotou|Só restam?/)).not.toBeInTheDocument();
  });

  it('o servidor recusa o pedido por falta de estoque: a frase dele aparece', async () => {
    mocks.checkout.mockRejectedValue(
      new ApiError(409, {
        message: 'Só restam 1 unidades de Açaí. Diminua a quantidade na sacola.',
        code: 'STORE_ORDER_OUT_OF_STOCK',
      }),
    );
    abrir({});

    fireEvent.click(await screen.findByRole('button', { name: /Fazer pedido/ }));

    expect(await screen.findByText(/Diminua a quantidade na sacola/)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('Sacola da loja de verdade', () => {
  it('manda o pedido à API com os ids e o total visto, e abre "Meus pedidos"', async () => {
    mocks.checkout.mockResolvedValue({ numero: 7 } as PedidoDaLoja);
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() => expect(mocks.checkout).toHaveBeenCalledOnce());
    expect(mocks.checkout).toHaveBeenCalledWith(
      SLUG,
      'token-do-google',
      expect.objectContaining({
        modalidade: 'ENTREGA',
        itens: [{ produtoId: 'p1', tamanhoId: 't1', escolhas: ['e1'], quantidade: 2 }],
        entrega: expect.objectContaining({ bairroId: 'b1', rua: 'Rua A' }),
        pagamento: 'DINHEIRO',
        agendadoPara: null,
        totalVisto: 47,
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/pedir/${SLUG}/pedidos?novo=7`));
  });

  it('com promoção, mostra o desconto e manda o total já com ele — o servidor confere', async () => {
    mocks.checkout.mockResolvedValue({ numero: 12 } as PedidoDaLoja);
    const acai = {
      id: 'p1',
      nome: 'Açaí',
      descricao: '',
      categoriaId: 'c1',
      imagemUrl: null,
      precoUnico: null,
      situacao: 'publicado' as const,
      tamanhos: [{ id: 't1', nome: '500ml', preco: 18, disponivel: true }],
      grupos: [],
    };
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({
          produtos: [acai],
          promocoes: [
            {
              id: 'promo-1',
              nome: 'Açaí 20%',
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
        })}
      />,
    );

    // 2 × (18,00 − 20%) + 2 × 3,00 de adicional = 34,80; com a taxa de 5, 39,80.
    expect(await screen.findByText('20% OFF')).toBeInTheDocument();
    // O de antes aparece riscado na linha, e sem riscar no resumo dos itens.
    expect(screen.getAllByText('R$ 42,00').map((elemento) => elemento.tagName)).toContain('S');
    expect(screen.getByText('R$ 34,80')).toBeInTheDocument();
    expect(screen.getByText(/Promoções/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ totalVisto: 39.8 }),
      ),
    );
  });

  it('no Pix, o erro do CPF aparece no campo, com foco nele; preenchido, o pedido segue', async () => {
    mocks.checkout.mockResolvedValue({ numero: 8 } as PedidoDaLoja);
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({ operacao: { ...OPERACAO, pagamentos: ['PIX_ONLINE', 'DINHEIRO'] } })}
      />,
    );

    // O botão não fica desabilitado: desabilitado, ele não diz o que falta.
    const seguir = await screen.findByRole('button', { name: /Ir para o pagamento/ });
    expect(seguir).toBeEnabled();
    fireEvent.click(seguir);

    const cpf = screen.getByLabelText('CPF de quem paga o Pix');
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(cpf).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Informe o CPF de quem paga o Pix.')).toBeInTheDocument();
    expect(cpf).toHaveFocus();

    fireEvent.change(cpf, { target: { value: '529.982.247-25' } });
    expect(cpf).not.toHaveAttribute('aria-invalid');
    fireEvent.click(screen.getByRole('button', { name: /Ir para o pagamento/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ pagamento: 'PIX_ONLINE', cpf: '52998224725' }),
      ),
    );
  });

  it('campo do endereço vazio: o erro aparece nele, o foco vai para ele e nada é enviado', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    // Com o endereço da conta escolhido, o formulário fica recolhido: "Editar" o abre.
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const rua = await screen.findByLabelText('Rua');
    expect(rua).not.toHaveAttribute('aria-invalid');
    fireEvent.change(rua, { target: { value: '' } });
    // Antes de tocar no botão, o campo vazio ainda não é tratado como erro.
    expect(screen.queryByText('Informe a rua.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    expect(screen.getByText('Informe a rua.')).toBeInTheDocument();
    expect(rua).toHaveAttribute('aria-invalid', 'true');
    expect(rua).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Falta preencher os campos marcados');
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it('CEP pela metade: o erro aparece no campo, com foco, e nada é enviado; completo, segue', async () => {
    mocks.checkout.mockResolvedValue({ numero: 9 } as PedidoDaLoja);
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const cep = await screen.findByLabelText('CEP');
    fireEvent.change(cep, { target: { value: '36980' } });
    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    expect(screen.getByText('Use 8 dígitos.')).toBeInTheDocument();
    expect(cep).toHaveAttribute('aria-invalid', 'true');
    expect(cep).toHaveFocus();
    expect(mocks.checkout).not.toHaveBeenCalled();

    fireEvent.change(cep, { target: { value: '36980-000' } });
    expect(cep).not.toHaveAttribute('aria-invalid');
    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ entrega: expect.objectContaining({ cep: '36980-000' }) }),
      ),
    );
  });

  it('sem endereço salvo, a cidade e a UF nascem as da loja; o endereço salvo não é trocado', async () => {
    const daLoja = {
      rua: 'Rua da Loja',
      numero: '1',
      complemento: null,
      bairro: '',
      cidade: 'Lajinha',
      estado: 'MG',
    };
    window.localStorage.removeItem(`loja:${SLUG}:user_1:cliente`);
    const { unmount } = render(
      <Sacola slug={SLUG} cardapio={cardapio({ enderecoDeRetirada: daLoja })} />,
    );

    expect(await screen.findByLabelText('Cidade')).toHaveValue('Lajinha');
    expect(screen.getByLabelText('UF')).toHaveValue('MG');
    unmount();

    // Com o endereço da conta, vale o da conta — ainda que a loja seja de outra cidade.
    window.localStorage.setItem(
      `loja:${SLUG}:user_1:cliente`,
      JSON.stringify({
        nome: 'Ana',
        telefone: '33999887766',
        entrega: {
          rua: 'Rua A',
          numero: '10',
          complemento: null,
          bairro: 'Centro',
          cidade: 'Ipatinga',
          estado: 'MG',
          cep: '',
          referencia: null,
        },
      }),
    );
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({ enderecoDeRetirada: { ...daLoja, cidade: 'Lajinha' } })}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(await screen.findByLabelText('Cidade')).toHaveValue('Ipatinga');
  });

  describe('mais de um endereço', () => {
    const CASA = {
      rua: 'Rua A',
      numero: '10',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Lajinha',
      estado: 'MG',
      cep: '',
      referencia: null,
    };
    const TRABALHO = { ...CASA, rua: 'Av. Brasil', numero: '900', bairro: 'Industrial' };
    const DOIS_BAIRROS = {
      ...OPERACAO,
      bairros: [
        { id: 'b1', nome: 'Centro', taxa: 5 },
        { id: 'b2', nome: 'Industrial', taxa: 8 },
      ],
    };
    const guardarLista = (lista: Array<{ id: string; apelido: string; endereco: object }>) =>
      window.localStorage.setItem(
        `loja:${SLUG}:user_1:cliente`,
        JSON.stringify({
          nome: 'Ana',
          telefone: '33999887766',
          // O último usado é o primeiro da lista.
          entrega: lista[0]?.endereco ?? CASA,
          enderecos: lista,
        }),
      );
    const lido = () =>
      JSON.parse(window.localStorage.getItem(`loja:${SLUG}:user_1:cliente`) ?? 'null');

    it('um endereço só: aparece como cartão "Casa", sem o formulário, e vai no pedido', async () => {
      mocks.checkout.mockResolvedValue({ numero: 10 } as PedidoDaLoja);
      render(<Sacola slug={SLUG} cardapio={cardapio()} />);

      const casa = await screen.findByRole('radio', { name: /Casa/ });
      expect(casa).toBeChecked();
      expect(screen.getByText('Rua A, 10 · Centro')).toBeInTheDocument();
      expect(screen.queryByLabelText('Rua')).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Outro endereço/ })).not.toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

      await waitFor(() =>
        expect(mocks.checkout).toHaveBeenCalledWith(
          SLUG,
          'token-do-google',
          expect.objectContaining({
            entrega: expect.objectContaining({ rua: 'Rua A', bairroId: 'b1' }),
          }),
        ),
      );
    });

    it('escolhe o outro endereço da lista, e é o dele que vai; a taxa acompanha o bairro', async () => {
      guardarLista([
        { id: 'a', apelido: 'Casa', endereco: CASA },
        { id: 'b', apelido: 'Trabalho', endereco: TRABALHO },
      ]);
      mocks.checkout.mockResolvedValue({ numero: 11 } as PedidoDaLoja);
      render(<Sacola slug={SLUG} cardapio={cardapio({ operacao: DOIS_BAIRROS })} />);

      expect(await screen.findByRole('radio', { name: /Casa/ })).toBeChecked();
      fireEvent.click(screen.getByRole('radio', { name: /Trabalho/ }));
      expect(screen.getByRole('radio', { name: /Trabalho/ })).toBeChecked();
      expect(screen.getByText('Av. Brasil, 900 · Industrial')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

      await waitFor(() =>
        expect(mocks.checkout).toHaveBeenCalledWith(
          SLUG,
          'token-do-google',
          expect.objectContaining({
            entrega: expect.objectContaining({ rua: 'Av. Brasil', bairroId: 'b2' }),
            // 2 × 21 + 8 do Industrial.
            totalVisto: 50,
          }),
        ),
      );
      // O último usado é o do trabalho, e os dois continuam guardados.
      await waitFor(() => expect(lido().entrega).toMatchObject({ rua: 'Av. Brasil' }));
      expect(lido().enderecos).toHaveLength(2);
    });

    it('"Outro endereço": formulário em branco (cidade e UF da loja), e o novo fica guardado com o nome', async () => {
      guardarLista([{ id: 'a', apelido: 'Casa', endereco: CASA }]);
      mocks.checkout.mockResolvedValue({ numero: 12 } as PedidoDaLoja);
      const daLoja = {
        rua: 'Rua da Loja',
        numero: '1',
        complemento: null,
        bairro: '',
        cidade: 'Lajinha',
        estado: 'MG',
      };
      render(
        <Sacola
          slug={SLUG}
          cardapio={cardapio({ operacao: DOIS_BAIRROS, enderecoDeRetirada: daLoja })}
        />,
      );

      fireEvent.click(await screen.findByRole('radio', { name: /Outro endereço/ }));

      expect(screen.getByLabelText('Rua')).toHaveValue('');
      expect(screen.getByLabelText('Cidade')).toHaveValue('Lajinha');
      // Já existe uma Casa: a sugestão passa para Trabalho.
      expect(screen.getByLabelText('Nome do endereço')).toHaveValue('Trabalho');
      expect(screen.getByRole('checkbox', { name: /Guardar este endereço/ })).toBeChecked();

      fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Av. Brasil' } });
      fireEvent.change(screen.getByLabelText('Número'), { target: { value: '900' } });
      fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Industrial' } });
      fireEvent.change(screen.getByLabelText('Nome do endereço'), {
        target: { value: 'Escritório' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

      await waitFor(() =>
        expect(mocks.checkout).toHaveBeenCalledWith(
          SLUG,
          'token-do-google',
          expect.objectContaining({
            entrega: expect.objectContaining({ rua: 'Av. Brasil', bairroId: 'b2' }),
          }),
        ),
      );
      await waitFor(() => expect(lido().enderecos).toHaveLength(2));
      expect(lido().enderecos[1]).toMatchObject({
        apelido: 'Escritório',
        endereco: { rua: 'Av. Brasil', numero: '900', bairro: 'Industrial' },
      });
    });

    it('desmarcado "Guardar este endereço", o pedido sai e a lista fica como estava', async () => {
      guardarLista([{ id: 'a', apelido: 'Casa', endereco: CASA }]);
      mocks.checkout.mockResolvedValue({ numero: 13 } as PedidoDaLoja);
      render(
        <Sacola
          slug={SLUG}
          cardapio={cardapio({
            operacao: DOIS_BAIRROS,
            enderecoDeRetirada: {
              rua: 'Rua da Loja',
              numero: '1',
              complemento: null,
              bairro: '',
              cidade: 'Lajinha',
              estado: 'MG',
            },
          })}
        />,
      );

      fireEvent.click(await screen.findByRole('radio', { name: /Outro endereço/ }));
      fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua Emprestada' } });
      fireEvent.change(screen.getByLabelText('Número'), { target: { value: '7' } });
      fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Industrial' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /Guardar este endereço/ }));
      expect(screen.queryByLabelText('Nome do endereço')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

      await waitFor(() => expect(mocks.checkout).toHaveBeenCalledOnce());
      await waitFor(() => expect(lido().entrega).toMatchObject({ rua: 'Rua Emprestada' }));
      expect(lido().enderecos).toHaveLength(1);
    });

    it('apagar pede confirmação e passa para o que sobrou', async () => {
      guardarLista([
        { id: 'a', apelido: 'Casa', endereco: CASA },
        { id: 'b', apelido: 'Trabalho', endereco: TRABALHO },
      ]);
      render(<Sacola slug={SLUG} cardapio={cardapio({ operacao: DOIS_BAIRROS })} />);

      fireEvent.click(await screen.findByRole('radio', { name: /Trabalho/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
      // Um toque só pergunta; "Manter" desiste.
      fireEvent.click(screen.getByRole('button', { name: 'Manter' }));
      expect(screen.getByRole('radio', { name: /Trabalho/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apagar mesmo' }));

      expect(screen.queryByRole('radio', { name: /Trabalho/ })).not.toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Casa/ })).toBeChecked();
      expect(lido().enderecos).toHaveLength(1);
    });

    it('endereço de um bairro que a loja não atende mais: avisa, e abre o formulário para trocar', async () => {
      guardarLista([{ id: 'a', apelido: 'Casa', endereco: { ...CASA, bairro: 'Distrito' } }]);
      render(<Sacola slug={SLUG} cardapio={cardapio()} />);

      expect(await screen.findByText(/bairro fora da área da loja/)).toBeInTheDocument();
      // O formulário abre sozinho: o bairro precisa ser escolhido de novo.
      expect(screen.getByLabelText('Bairro')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));
      expect(screen.getByText('Escolha o bairro.')).toBeInTheDocument();
      expect(mocks.checkout).not.toHaveBeenCalled();
    });
  });

  it('Pix direto: sem CPF, e o pedido sai como um pedido comum, para a loja conferir depois', async () => {
    mocks.checkout.mockResolvedValue({ numero: 14 } as PedidoDaLoja);
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({ operacao: { ...OPERACAO, pagamentos: ['PIX_DIRETO', 'DINHEIRO'] } })}
      />,
    );

    // O Pix aparece no grupo de pagar agora, com o que acontece depois do pedido.
    const pix = await screen.findByRole('radio', { name: /^Pix/ });
    fireEvent.click(pix);
    expect(
      screen.getByText(/Depois de pagar, envie o comprovante pelo WhatsApp da loja/),
    ).toBeInTheDocument();
    // O CPF é do Asaas: aqui não há cobrança para gerar.
    expect(screen.queryByLabelText('CPF de quem paga o Pix')).not.toBeInTheDocument();
    // E o botão não leva a página de pagamento nenhuma: o pedido sai na hora.
    fireEvent.click(screen.getByRole('button', { name: /Fazer pedido/ }));

    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith(
        SLUG,
        'token-do-google',
        expect.objectContaining({ pagamento: 'PIX_DIRETO', cpf: null }),
      ),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/pedir/${SLUG}/pedidos?novo=14`));
  });

  it('o troco fica logo abaixo do Dinheiro, e antes da observação', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    const dinheiro = await screen.findByRole('radio', { name: /Dinheiro/ });
    const troco = screen.getByLabelText('Precisa de troco para quanto?');
    const observacao = screen.getByLabelText('Alguma observação?');
    const depois = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & 4);
    expect(depois(dinheiro, troco)).toBe(true);
    expect(depois(troco, observacao)).toBe(true);
  });

  it('as formas de pagamento falam com o cliente, e não com a loja', async () => {
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({
          operacao: { ...OPERACAO, pagamentos: ['DINHEIRO', 'CREDITO_MAQUININHA'] },
        })}
      />,
    );

    expect(await screen.findByText('Pagar na entrega')).toBeInTheDocument();
    expect(screen.queryByText(/O cliente informa/)).not.toBeInTheDocument();
    // O grupo já diz "na entrega": o título não repete "na maquininha".
    expect(screen.getByRole('radio', { name: /^Crédito/ })).toBeInTheDocument();
  });

  it('a loja de verdade com Pix não mostra o aviso da demonstração', async () => {
    render(
      <Sacola
        slug={SLUG}
        cardapio={cardapio({ operacao: { ...OPERACAO, pagamentos: ['PIX_ONLINE'] } })}
      />,
    );

    await screen.findByRole('button', { name: /Ir para o pagamento/ });
    expect(screen.queryByText(/Nesta demonstração/)).not.toBeInTheDocument();
  });

  it('a recusa do servidor aparece com a frase dele, e a sacola fica', async () => {
    mocks.checkout.mockRejectedValue(
      new ApiError(409, { message: 'O total mudou para R$ 52,00. Confira a sacola.' }),
    );
    render(<Sacola slug={SLUG} cardapio={cardapio()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Fazer pedido/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O total mudou para R$ 52,00.');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`loja:${SLUG}:sacola`)).toContain('Açaí');
  });

  it('loja que ainda é vitrine diz isso antes do formulário', async () => {
    render(<Sacola slug={SLUG} cardapio={cardapio({ vitrine: true })} />);
    expect(
      await screen.findByText('Esta loja ainda não recebe pedidos por aqui'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fazer pedido/ })).not.toBeInTheDocument();
  });
});
