import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@motoboycity/api-client';
import type { OperacaoPublica, PedidoDaLoja } from '@motoboycity/types';
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
  publicStoreOrdersApi: { checkout: mocks.checkout, pedidos: mocks.pedidos },
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
    ...mudancas,
  };
}

beforeEach(() => {
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
