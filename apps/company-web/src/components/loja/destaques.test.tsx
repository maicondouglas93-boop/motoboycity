import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DestaqueDaLoja, StoreCatalog, StoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DestaquesPage from '@/app/(app)/loja/marketing/destaques/page';
import MarketingPage from '@/app/(app)/loja/marketing/page';
import { FormularioDeDestaque } from '@/components/loja/formulario-de-destaque';

/**
 * Marketing → Destaques no painel: a lista com a ordem, o formulário com os produtos em
 * ordem, e o que eles mandam à API. Quais destaques a página mostra é regra do pacote
 * compartilhado (testada em `packages/validation`); aqui se confere a tela.
 */

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  promotions: vi.fn(),
  coupons: vi.fn(),
  highlights: vi.fn(),
  createHighlight: vi.fn(),
  updateHighlight: vi.fn(),
  setHighlightActive: vi.fn(),
  duplicateHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
  reorderHighlights: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreCatalogApi: { catalog: mocks.catalog },
  companyStoreMarketingApi: {
    promotions: mocks.promotions,
    coupons: mocks.coupons,
    highlights: mocks.highlights,
    createHighlight: mocks.createHighlight,
    updateHighlight: mocks.updateHighlight,
    setHighlightActive: mocks.setHighlightActive,
    duplicateHighlight: mocks.duplicateHighlight,
    deleteHighlight: mocks.deleteHighlight,
    reorderHighlights: mocks.reorderHighlights,
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

const ACAI = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const SUCO = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PIZZA = '9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const SECAO = '5c1e3a7d-2b4f-4c8a-9d0e-6f7a8b9c0d1e';

function produto(
  mudancas: Partial<StoreProduct> & Pick<StoreProduct, 'id' | 'name'>,
): StoreProduct {
  return {
    categoryId: SECAO,
    description: '',
    imageUrl: null,
    price: 10,
    status: 'PUBLISHED',
    sizes: [],
    optionGroups: [],
    updatedAt: '2026-09-25T12:00:00.000Z',
    ...mudancas,
  };
}

const CATALOGO: StoreCatalog = {
  categories: [{ id: SECAO, name: 'Cardápio' }],
  products: [
    produto({ id: ACAI, name: 'Açaí', price: 18 }),
    produto({ id: SUCO, name: 'Suco', price: 8 }),
    produto({ id: PIZZA, name: 'Pizza', price: 45, status: 'PAUSED' }),
  ],
};

function destaque(mudancas: Partial<DestaqueDaLoja> = {}): DestaqueDaLoja {
  return {
    id: 'd1',
    titulo: 'Mais pedidos',
    produtoIds: [ACAI, SUCO],
    inicio: null,
    fim: null,
    ativo: true,
    posicao: 0,
    criadoEm: '2026-09-29T12:00:00.000Z',
    atualizadoEm: '2026-09-29T12:00:00.000Z',
    ...mudancas,
  };
}

/** Três destaques, na ordem da loja. */
const TRES = [
  destaque({ id: 'a', titulo: 'Mais pedidos', posicao: 0 }),
  destaque({ id: 'b', titulo: 'Novidades', posicao: 1, produtoIds: [SUCO] }),
  destaque({ id: 'c', titulo: 'Almoço', posicao: 2, produtoIds: [PIZZA] }),
];

function comQuery(tela: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{tela}</QueryClientProvider>);
}

/** Os títulos que a lista mostra, na ordem em que aparecem. */
function titulosNaTela(): string[] {
  return screen
    .getAllByRole('button', { name: /^Subir / })
    .map((botao) => (botao.getAttribute('aria-label') ?? '').replace('Subir ', ''));
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.catalog.mockResolvedValue(CATALOGO);
  mocks.promotions.mockResolvedValue([]);
  mocks.coupons.mockResolvedValue([]);
  mocks.highlights.mockResolvedValue([]);
});

describe('Marketing — visão geral, destaques', () => {
  it('conta os destaques no ar', async () => {
    mocks.highlights.mockResolvedValue([
      destaque({ id: 'a' }),
      destaque({ id: 'b', ativo: false }),
      destaque({ id: 'c', inicio: '2999-01-01' }),
    ]);
    comQuery(<MarketingPage />);

    expect(await screen.findByText('1 no ar de 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver destaques' })).toHaveAttribute(
      'href',
      '/loja/marketing/destaques',
    );
  });

  it('sem destaque, convida a criar o primeiro', async () => {
    comQuery(<MarketingPage />);

    expect(await screen.findByRole('link', { name: /Novo destaque/ })).toHaveAttribute(
      'href',
      '/loja/marketing/destaques/nova',
    );
  });
});

/**
 * Um servidor de mentira que GUARDA a ordem: ler devolve o que foi gravado, como o de verdade.
 * Sem isso, a releitura que vem depois de cada gravação traria a ordem de antes e desfaria, na
 * tela, o que o teste acabou de mover — e o teste ficaria dependendo de quem chega primeiro.
 */
function servidorQueGuardaAOrdem() {
  let guardados = TRES;
  mocks.highlights.mockImplementation(() => Promise.resolve(guardados));
  mocks.reorderHighlights.mockImplementation((_token: string, ids: string[]) => {
    guardados = ids.map((id, indice) => ({
      ...TRES.find((item) => item.id === id)!,
      posicao: indice,
    }));
    return Promise.resolve(guardados);
  });
}

describe('Destaques — a lista', () => {
  it('lista na ordem da loja, com a situação, os produtos e o período', async () => {
    mocks.highlights.mockResolvedValue([
      destaque({ inicio: '2026-09-01', fim: '2999-12-31' }),
      destaque({ id: 'b', titulo: 'Almoço', posicao: 1, ativo: false, produtoIds: [SUCO] }),
    ]);
    comQuery(<DestaquesPage />);

    expect(await screen.findByText('Mais pedidos')).toBeInTheDocument();
    expect(titulosNaTela()).toEqual(['Mais pedidos', 'Almoço']);
    expect(screen.getByText('No ar')).toBeInTheDocument();
    expect(screen.getByText('Desligado')).toBeInTheDocument();
    expect(screen.getByText('2 produtos: Açaí, Suco')).toBeInTheDocument();
    expect(screen.getByText('1 produto: Suco')).toBeInTheDocument();
    expect(screen.getByText('de 01/09/2026 a 31/12/2999')).toBeInTheDocument();
  });

  it('o produto que foi apagado não aparece no resumo, e o destaque sem produto diz isso', async () => {
    mocks.highlights.mockResolvedValue([
      destaque({ id: 'a', produtoIds: [ACAI, 'apagado'] }),
      destaque({ id: 'b', titulo: 'Vazio', posicao: 1, produtoIds: ['apagado'] }),
    ]);
    comQuery(<DestaquesPage />);

    expect(await screen.findByText('1 produto: Açaí')).toBeInTheDocument();
    expect(screen.getByText('Sem produtos (os escolhidos foram apagados).')).toBeInTheDocument();
  });

  it('o primeiro não sobe e o último não desce', async () => {
    mocks.highlights.mockResolvedValue(TRES);
    comQuery(<DestaquesPage />);

    await screen.findByText('Almoço');
    expect(screen.getByRole('button', { name: 'Subir Mais pedidos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Almoço' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Mais pedidos' })).toBeEnabled();
  });

  it('descer muda a lista na hora e grava a ordem INTEIRA', async () => {
    servidorQueGuardaAOrdem();
    comQuery(<DestaquesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Descer Mais pedidos' }));

    // A tela já mostra a ordem nova, antes de a API responder.
    await waitFor(() => expect(titulosNaTela()).toEqual(['Novidades', 'Mais pedidos', 'Almoço']));
    await waitFor(() =>
      expect(mocks.reorderHighlights).toHaveBeenCalledWith('token', ['b', 'a', 'c']),
    );
  });

  it('subir move um lugar para cima', async () => {
    servidorQueGuardaAOrdem();
    comQuery(<DestaquesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Subir Almoço' }));

    await waitFor(() => expect(titulosNaTela()).toEqual(['Mais pedidos', 'Almoço', 'Novidades']));
    await waitFor(() =>
      expect(mocks.reorderHighlights).toHaveBeenCalledWith('token', ['a', 'c', 'b']),
    );
  });

  it('dois toques seguidos gravam uma lista de cada vez, cada uma a partir do que a tela mostra', async () => {
    servidorQueGuardaAOrdem();
    comQuery(<DestaquesPage />);

    // O "Mais pedidos" desce duas vezes seguidas, antes de a primeira resposta chegar.
    const descer = await screen.findByRole('button', { name: 'Descer Mais pedidos' });
    fireEvent.click(descer);
    fireEvent.click(screen.getByRole('button', { name: 'Descer Mais pedidos' }));

    await waitFor(() => expect(titulosNaTela()).toEqual(['Novidades', 'Almoço', 'Mais pedidos']));
    await waitFor(() => expect(mocks.reorderHighlights).toHaveBeenCalledTimes(2));
    expect(mocks.reorderHighlights.mock.calls.map(([, ids]) => ids)).toEqual([
      ['b', 'a', 'c'],
      ['b', 'c', 'a'],
    ]);
  });

  it('a recusa (outra aba mudou a lista) aparece, e a lista se relê', async () => {
    const { ApiError } = await import('@motoboycity/api-client');
    mocks.highlights.mockResolvedValueOnce(TRES).mockResolvedValue([TRES[1]!, TRES[0]!]);
    mocks.reorderHighlights.mockRejectedValue(
      new ApiError(409, {
        message: 'Os destaques mudaram em outra tela. A lista foi atualizada: mova de novo.',
        code: 'STORE_HIGHLIGHT_ORDER_STALE',
      }),
    );
    comQuery(<DestaquesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Descer Mais pedidos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Os destaques mudaram em outra tela.',
    );
    // Relida do servidor: o "Almoço" já não está lá.
    await waitFor(() => expect(screen.queryByText('Almoço')).not.toBeInTheDocument());
  });

  it('desligar grava na API', async () => {
    mocks.highlights.mockResolvedValue([destaque()]);
    mocks.setHighlightActive.mockResolvedValue(destaque({ ativo: false }));
    comQuery(<DestaquesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desligar' }));

    await waitFor(() =>
      expect(mocks.setHighlightActive).toHaveBeenCalledWith('token', 'd1', false),
    );
  });

  it('excluir pede confirmação, e cancelar não apaga', async () => {
    mocks.highlights.mockResolvedValue([destaque()]);
    mocks.deleteHighlight.mockResolvedValue({ deleted: true });
    comQuery(<DestaquesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Mais pedidos' }));
    expect(mocks.deleteHighlight).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.deleteHighlight).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Mais pedidos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(mocks.deleteHighlight).toHaveBeenCalledWith('token', 'd1'));
  });

  it('duplicar manda o id, e a falha do servidor aparece com o título', async () => {
    const { ApiError } = await import('@motoboycity/api-client');
    mocks.highlights.mockResolvedValue([destaque()]);
    mocks.duplicateHighlight.mockRejectedValue(
      new ApiError(409, {
        message: 'Você já tem 10 destaques, que é o máximo. Apague ou edite um deles.',
        code: 'STORE_HIGHLIGHT_LIMIT',
      }),
    );
    comQuery(<DestaquesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar Mais pedidos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mais pedidos: Você já tem 10 destaques, que é o máximo.',
    );
    expect(mocks.duplicateHighlight).toHaveBeenCalledWith('token', 'd1');
  });

  it('sem destaque, mostra o convite', async () => {
    comQuery(<DestaquesPage />);

    expect(await screen.findByText('Nenhum destaque ainda.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Criar destaque/ })).toHaveAttribute(
      'href',
      '/loja/marketing/destaques/nova',
    );
  });
});

describe('Destaques — o formulário', () => {
  /** O produto ainda não escolhido, pelo botão de adicionar dele. */
  const adicionar = async (nome: string) =>
    fireEvent.click(await screen.findByRole('button', { name: `Adicionar ${nome}` }));
  /** Os produtos escolhidos, na ordem em que estão. */
  const escolhidosNaTela = () =>
    within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => within(item).getAllByText(/./)[1]!.textContent);

  it('tocar em criar com o formulário vazio mostra o que falta, campo por campo', async () => {
    comQuery(<FormularioDeDestaque />);

    fireEvent.click(await screen.findByRole('button', { name: 'Criar destaque' }));

    expect(
      await screen.findByText('Dê um título ao destaque, com pelo menos 2 letras.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Escolha ao menos um produto.')).toBeInTheDocument();
    expect(mocks.createHighlight).not.toHaveBeenCalled();
  });

  it('escolhe os produtos, muda a ordem e cria: o que vai à API é a ordem da tela', async () => {
    mocks.createHighlight.mockResolvedValue(destaque());
    comQuery(<FormularioDeDestaque />);

    fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'Mais pedidos' } });
    await adicionar('Açaí');
    await adicionar('Suco');
    // O Suco sobe: passa a ser o primeiro.
    fireEvent.click(screen.getByRole('button', { name: 'Subir Suco' }));
    expect(escolhidosNaTela()).toEqual(['Suco', 'Açaí']);
    fireEvent.click(screen.getByRole('button', { name: 'Criar destaque' }));

    await waitFor(() => expect(mocks.createHighlight).toHaveBeenCalledTimes(1));
    expect(mocks.createHighlight).toHaveBeenCalledWith('token', {
      titulo: 'Mais pedidos',
      produtoIds: [SUCO, ACAI],
      inicio: null,
      fim: null,
      ativo: true,
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/loja/marketing/destaques'));
  });

  it('o produto escolhido sai da lista de adicionar, e tirar do destaque o devolve', async () => {
    comQuery(<FormularioDeDestaque />);

    await adicionar('Açaí');

    expect(screen.queryByRole('button', { name: 'Adicionar Açaí' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Açaí do destaque' }));
    expect(await screen.findByRole('button', { name: 'Adicionar Açaí' })).toBeInTheDocument();
  });

  it('o primeiro não sobe e o último não desce', async () => {
    comQuery(<FormularioDeDestaque />);
    await adicionar('Açaí');
    await adicionar('Suco');

    expect(screen.getByRole('button', { name: 'Subir Açaí' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Suco' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer Açaí' })).toBeEnabled();
  });

  it('avisa que o produto pausado não aparece enquanto não estiver à venda', async () => {
    comQuery(<FormularioDeDestaque />);

    await adicionar('Pizza');

    expect(await screen.findByText(/não aparece enquanto não estiver à venda/)).toBeInTheDocument();
  });

  it('o destaque cheio não deixa adicionar mais', async () => {
    const muitos = Array.from(
      { length: 12 },
      (_, indice) => `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`,
    );
    mocks.catalog.mockResolvedValue({
      categories: CATALOGO.categories,
      products: [
        ...muitos.map((id, indice) => produto({ id, name: `Produto ${indice + 1}` })),
        produto({ id: ACAI, name: 'Açaí' }),
      ],
    });
    comQuery(<FormularioDeDestaque destaque={destaque({ produtoIds: muitos })} />);

    expect(
      await screen.findByText('O destaque está cheio: tire um produto para pôr outro.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar Açaí' })).not.toBeInTheDocument();
  });

  it('a busca acha o produto para adicionar', async () => {
    mocks.catalog.mockResolvedValue({
      categories: CATALOGO.categories,
      products: Array.from({ length: 8 }, (_, indice) =>
        produto({
          id: `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`,
          name: indice === 5 ? 'Brigadeiro' : `Item ${indice}`,
        }),
      ),
    });
    comQuery(<FormularioDeDestaque />);

    fireEvent.change(await screen.findByLabelText('Buscar produto para adicionar'), {
      target: { value: 'briga' },
    });

    expect(screen.getByRole('button', { name: 'Adicionar Brigadeiro' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar Item 1' })).not.toBeInTheDocument();
  });

  it('o período só aparece quando se pede, e a data final antes da inicial é recusada no campo', async () => {
    comQuery(<FormularioDeDestaque />);

    fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'Novidades' } });
    await adicionar('Açaí');
    expect(screen.queryByLabelText('De')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Só num período/ }));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar destaque' }));

    expect(await screen.findByText('A data final vem antes da inicial.')).toBeInTheDocument();
    expect(mocks.createHighlight).not.toHaveBeenCalled();
  });

  it('editar carrega os valores e salva pelo id, mantendo ligado ou desligado', async () => {
    mocks.updateHighlight.mockResolvedValue(destaque({ titulo: 'Campeões' }));
    comQuery(<FormularioDeDestaque destaque={destaque({ ativo: false })} />);

    const titulo = await screen.findByLabelText('Título');
    expect(titulo).toHaveValue('Mais pedidos');
    await screen.findByText('Açaí', { selector: 'p' });
    expect(escolhidosNaTela()).toEqual(['Açaí', 'Suco']);

    fireEvent.change(titulo, { target: { value: 'Campeões' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.updateHighlight).toHaveBeenCalledWith(
        'token',
        'd1',
        expect.objectContaining({ titulo: 'Campeões', produtoIds: [ACAI, SUCO], ativo: false }),
      ),
    );
  });

  it('o produto apagado depois de entrar no destaque sai sozinho, e não vai de volta à API', async () => {
    mocks.updateHighlight.mockResolvedValue(destaque());
    comQuery(<FormularioDeDestaque destaque={destaque({ produtoIds: [ACAI, 'apagado', SUCO] })} />);

    await screen.findByText('Açaí', { selector: 'p' });
    expect(escolhidosNaTela()).toEqual(['Açaí', 'Suco']);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.updateHighlight).toHaveBeenCalledWith(
        'token',
        'd1',
        expect.objectContaining({ produtoIds: [ACAI, SUCO] }),
      ),
    );
  });

  it('a recusa do servidor aparece no formulário, sem sair da tela', async () => {
    const { ApiError } = await import('@motoboycity/api-client');
    mocks.createHighlight.mockRejectedValue(
      new ApiError(409, {
        message: 'Você já tem 10 destaques, que é o máximo. Apague ou edite um deles.',
        code: 'STORE_HIGHLIGHT_LIMIT',
      }),
    );
    comQuery(<FormularioDeDestaque />);

    fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'Um a mais' } });
    await adicionar('Açaí');
    fireEvent.click(screen.getByRole('button', { name: 'Criar destaque' }));

    expect(await screen.findByText(/Você já tem 10 destaques/)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
