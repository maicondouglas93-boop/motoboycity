import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PromocaoDaLoja, StoreCatalog, StoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PromocoesPage from '@/app/(app)/loja/marketing/promocoes/page';
import MarketingPage from '@/app/(app)/loja/marketing/page';
import { FormularioDePromocao } from '@/components/loja/formulario-de-promocao';

/**
 * Marketing → Promoções no painel: a lista, o formulário e o que eles mandam à
 * API. A conta do desconto é da regra compartilhada (testada em
 * `packages/validation`); aqui se confere a tela.
 */

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  promotions: vi.fn(),
  createPromotion: vi.fn(),
  updatePromotion: vi.fn(),
  setPromotionActive: vi.fn(),
  duplicatePromotion: vi.fn(),
  deletePromotion: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreCatalogApi: { catalog: mocks.catalog },
  companyStoreMarketingApi: {
    promotions: mocks.promotions,
    createPromotion: mocks.createPromotion,
    updatePromotion: mocks.updatePromotion,
    setPromotionActive: mocks.setPromotionActive,
    duplicatePromotion: mocks.duplicatePromotion,
    deletePromotion: mocks.deletePromotion,
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));

const ACAI_ID = '0b0d9e2c-1f0a-4d6b-8f6e-1a2b3c4d5e6f';
const SUCO_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SECAO_ID = '5c1e3a7d-2b4f-4c8a-9d0e-6f7a8b9c0d1e';

function produto(
  mudancas: Partial<StoreProduct> & Pick<StoreProduct, 'id' | 'name'>,
): StoreProduct {
  return {
    categoryId: SECAO_ID,
    description: '',
    imageUrl: null,
    price: 10,
    status: 'PUBLISHED',
    stock: null,
    sizes: [],
    optionGroups: [],
    updatedAt: '2026-09-25T12:00:00.000Z',
    ...mudancas,
  };
}

const CATALOGO: StoreCatalog = {
  categories: [{ id: SECAO_ID, name: 'Açaís' }],
  products: [
    produto({
      id: ACAI_ID,
      name: 'Açaí',
      price: null,
      sizes: [
        { id: 't1', name: '300ml', price: 12, available: true },
        { id: 't2', name: '500ml', price: 18, available: true },
      ],
    }),
    produto({ id: SUCO_ID, name: 'Suco', price: 10 }),
  ],
};

function promocao(mudancas: Partial<PromocaoDaLoja> = {}): PromocaoDaLoja {
  return {
    id: 'promo-1',
    nome: 'Açaí 20% OFF',
    tipo: 'PERCENTUAL',
    alvo: 'PRODUTO',
    produtoId: ACAI_ID,
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
    ativa: true,
    limiteDeUsos: null,
    usos: 0,
    criadaEm: '2026-09-29T12:00:00.000Z',
    atualizadaEm: '2026-09-29T12:00:00.000Z',
    ...mudancas,
  };
}

function comQuery(tela: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{tela}</QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.catalog.mockResolvedValue(CATALOGO);
  mocks.promotions.mockResolvedValue([]);
});

describe('Marketing — visão geral', () => {
  it('conta o que está no ar, o que vai começar e os usos', async () => {
    mocks.promotions.mockResolvedValue([
      promocao({ id: 'a', usos: 3 }),
      promocao({ id: 'b', ativa: false }),
      promocao({ id: 'c', inicio: '2999-01-01', usos: 2 }),
    ]);
    comQuery(<MarketingPage />);

    const noAr = (await screen.findByText('No ar agora')).parentElement as HTMLElement;
    expect(within(noAr).getByText('1')).toBeInTheDocument();
    const agendadas = screen.getByText('Agendadas').parentElement as HTMLElement;
    expect(within(agendadas).getByText('1')).toBeInTheDocument();
    const usos = screen.getByText('Pedidos com promoção').parentElement as HTMLElement;
    expect(within(usos).getByText('5')).toBeInTheDocument();
  });

  it('sem promoção, convida a criar a primeira', async () => {
    comQuery(<MarketingPage />);

    expect(await screen.findByText(/Você ainda não criou nenhuma/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nova promoção/ })).toHaveAttribute(
      'href',
      '/loja/marketing/promocoes/nova',
    );
  });
});

describe('Promoções — a lista', () => {
  it('lista com a situação, o que faz e onde vale', async () => {
    mocks.promotions.mockResolvedValue([
      promocao({
        limiteDeUsos: 50,
        usos: 12,
        diasDaSemana: [5, 6],
        horaInicio: '18:00',
        horaFim: '23:00',
      }),
    ]);
    comQuery(<PromocoesPage />);

    expect(await screen.findByText('Açaí 20% OFF')).toBeInTheDocument();
    expect(screen.getByText('No ar')).toBeInTheDocument();
    expect(screen.getByText(/20% de desconto/)).toBeInTheDocument();
    expect(await screen.findByText(/· Açaí$/)).toBeInTheDocument();
    expect(screen.getByText(/sex, sáb · 18:00 às 23:00/)).toBeInTheDocument();
    expect(screen.getByText(/12 de 50 usos/)).toBeInTheDocument();
  });

  it('a esgotada e a desligada aparecem como tal, e o filtro separa', async () => {
    mocks.promotions.mockResolvedValue([
      promocao({ id: 'a', nome: 'Acabou', limiteDeUsos: 5, usos: 5 }),
      promocao({ id: 'b', nome: 'Parada', ativa: false }),
      promocao({ id: 'c', nome: 'Rodando' }),
    ]);
    comQuery(<PromocoesPage />);

    expect(await screen.findByText('Esgotada')).toBeInTheDocument();
    expect(screen.getByText('Desligada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /No ar \(1\)/ }));
    expect(screen.getByText('Rodando')).toBeInTheDocument();
    expect(screen.queryByText('Parada')).not.toBeInTheDocument();
  });

  it('a busca acha pelo nome', async () => {
    mocks.promotions.mockResolvedValue([
      promocao({ id: 'a', nome: 'Açaí 20% OFF' }),
      promocao({ id: 'b', nome: 'Suco em dobro' }),
    ]);
    comQuery(<PromocoesPage />);

    fireEvent.change(await screen.findByLabelText('Buscar promoção'), {
      target: { value: 'suco' },
    });

    expect(screen.getByText('Suco em dobro')).toBeInTheDocument();
    expect(screen.queryByText('Açaí 20% OFF')).not.toBeInTheDocument();
  });

  it('desligar grava na API e relê a lista', async () => {
    mocks.promotions.mockResolvedValue([promocao()]);
    mocks.setPromotionActive.mockResolvedValue(promocao({ ativa: false }));
    comQuery(<PromocoesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desligar' }));

    await waitFor(() =>
      expect(mocks.setPromotionActive).toHaveBeenCalledWith('token', 'promo-1', false),
    );
  });

  it('excluir pede confirmação, e cancelar não apaga', async () => {
    mocks.promotions.mockResolvedValue([promocao()]);
    mocks.deletePromotion.mockResolvedValue({ deleted: true });
    comQuery(<PromocoesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Açaí 20% OFF' }));
    expect(mocks.deletePromotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.deletePromotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Açaí 20% OFF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(mocks.deletePromotion).toHaveBeenCalledWith('token', 'promo-1'));
  });

  it('duplicar manda o id, e a falha do servidor aparece com o nome da promoção', async () => {
    mocks.promotions.mockResolvedValue([promocao()]);
    mocks.duplicatePromotion.mockRejectedValue(new Error('caiu'));
    comQuery(<PromocoesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar Açaí 20% OFF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Açaí 20% OFF: não foi possível duplicar.',
    );
    expect(mocks.duplicatePromotion).toHaveBeenCalledWith('token', 'promo-1');
  });
});

describe('Promoções — o formulário', () => {
  it('tocar em criar com o formulário vazio mostra o que falta, campo por campo', async () => {
    comQuery(<FormularioDePromocao />);

    fireEvent.click(await screen.findByRole('button', { name: 'Criar promoção' }));

    expect(
      await screen.findByText('Dê um nome à promoção, para achá-la na lista.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Escolha o produto.')).toBeInTheDocument();
    expect(screen.getByText('Use um desconto inteiro de 1% a 90%.')).toBeInTheDocument();
    expect(mocks.createPromotion).not.toHaveBeenCalled();
  });

  it('cria a promoção com o que foi escolhido e volta para a lista', async () => {
    mocks.createPromotion.mockResolvedValue(promocao());
    comQuery(<FormularioDePromocao />);

    fireEvent.change(await screen.findByLabelText('Nome da promoção'), {
      target: { value: 'Açaí 20% OFF' },
    });
    // O catálogo chega depois do primeiro desenho: espera o produto na lista.
    await screen.findByRole('option', { name: 'Açaí' });
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: ACAI_ID } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar promoção' }));

    await waitFor(() => expect(mocks.createPromotion).toHaveBeenCalledTimes(1));
    expect(mocks.createPromotion).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        nome: 'Açaí 20% OFF',
        tipo: 'PERCENTUAL',
        alvo: 'PRODUTO',
        produtoId: ACAI_ID,
        categoriaId: null,
        percentual: 20,
        inicio: null,
        horaInicio: null,
        diasDaSemana: [],
        limiteDeUsos: null,
        ativa: true,
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/loja/marketing/promocoes'));
  });

  it('mostra, antes de salvar, como o cliente vê o "De / Por"', async () => {
    comQuery(<FormularioDePromocao />);

    fireEvent.change(await screen.findByLabelText('Nome da promoção'), { target: { value: 'X' } });
    await screen.findByRole('option', { name: 'Açaí' });
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: ACAI_ID } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '20' } });

    const previa = (await screen.findByText('Como o cliente vê')).parentElement as HTMLElement;
    // O menor preço do açaí é o de 300ml: R$ 12,00, e com 20% fica R$ 9,60.
    expect(within(previa).getByText(/12,00/)).toBeInTheDocument();
    expect(within(previa).getByText(/9,60/)).toBeInTheDocument();
    expect(within(previa).getByText('20% OFF')).toBeInTheDocument();
  });

  it('preço promocional só para produto de preço único, e não para a seção inteira', async () => {
    comQuery(<FormularioDePromocao />);

    await screen.findByRole('option', { name: 'Açaí' });
    fireEvent.click(screen.getByRole('radio', { name: /Preço promocional/ }));

    // O açaí tem tamanhos: sai da lista neste tipo.
    expect(screen.queryByRole('option', { name: 'Açaí' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Suco' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Numa seção inteira/ }));
    // Ao trocar para a seção, o tipo de preço fica fora de alcance.
    expect(screen.getByRole('radio', { name: /Preço promocional/ })).toBeDisabled();
  });

  it('os campos de período, horário e limite só aparecem quando se pede', async () => {
    comQuery(<FormularioDePromocao />);

    expect(screen.queryByLabelText('Das')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantos pedidos')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Só em certos dias ou horários/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Limitar quantos pedidos/ }));

    expect(screen.getByLabelText('Das')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantos pedidos')).toBeInTheDocument();
  });

  it('horário sem o fim é recusado com a mensagem certa', async () => {
    comQuery(<FormularioDePromocao />);

    fireEvent.change(await screen.findByLabelText('Nome da promoção'), { target: { value: 'X' } });
    await screen.findByRole('option', { name: 'Suco' });
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: SUCO_ID } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Só em certos dias ou horários/ }));
    fireEvent.change(screen.getByLabelText('Das'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar promoção' }));

    expect(
      await screen.findByText('Informe o começo e o fim do horário, ou nenhum dos dois.'),
    ).toBeInTheDocument();
    expect(mocks.createPromotion).not.toHaveBeenCalled();
  });

  it('editar carrega os valores e salva pelo id', async () => {
    mocks.updatePromotion.mockResolvedValue(promocao({ percentual: 30 }));
    comQuery(<FormularioDePromocao promocao={promocao()} />);

    const campo = await screen.findByLabelText('Desconto (%)');
    expect(campo).toHaveValue('20');
    expect(screen.getByLabelText('Nome da promoção')).toHaveValue('Açaí 20% OFF');

    fireEvent.change(campo, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.updatePromotion).toHaveBeenCalledWith(
        'token',
        'promo-1',
        expect.objectContaining({ percentual: 30, ativa: true }),
      ),
    );
  });

  it('a recusa do servidor aparece no formulário, sem sair da tela', async () => {
    const { ApiError } = await import('@motoboycity/api-client');
    mocks.createPromotion.mockRejectedValue(
      new ApiError(400, { message: 'O preço promocional precisa ser menor que o de hoje.' }),
    );
    comQuery(<FormularioDePromocao />);

    fireEvent.change(await screen.findByLabelText('Nome da promoção'), { target: { value: 'X' } });
    await screen.findByRole('option', { name: 'Suco' });
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: SUCO_ID } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar promoção' }));

    expect(
      await screen.findByText('O preço promocional precisa ser menor que o de hoje.'),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
