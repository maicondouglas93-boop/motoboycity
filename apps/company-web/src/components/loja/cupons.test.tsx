import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CupomDaLoja, StoreCatalog, StoreProduct } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CuponsPage from '@/app/(app)/loja/marketing/cupons/page';
import MarketingPage from '@/app/(app)/loja/marketing/page';
import { FormularioDeCupom } from '@/components/loja/formulario-de-cupom';

/**
 * Marketing → Cupons no painel: a lista, o formulário e o que eles mandam à API.
 * A conta do desconto é da regra compartilhada (testada em `packages/validation`);
 * aqui se confere a tela.
 */

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  promotions: vi.fn(),
  coupons: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  setCouponActive: vi.fn(),
  duplicateCoupon: vi.fn(),
  deleteCoupon: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreCatalogApi: { catalog: mocks.catalog },
  companyStoreMarketingApi: {
    promotions: mocks.promotions,
    coupons: mocks.coupons,
    createCoupon: mocks.createCoupon,
    updateCoupon: mocks.updateCoupon,
    setCouponActive: mocks.setCouponActive,
    duplicateCoupon: mocks.duplicateCoupon,
    deleteCoupon: mocks.deleteCoupon,
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
    sizes: [],
    optionGroups: [],
    updatedAt: '2026-09-25T12:00:00.000Z',
    ...mudancas,
  };
}

const CATALOGO: StoreCatalog = {
  categories: [{ id: SECAO_ID, name: 'Açaís' }],
  products: [
    produto({ id: ACAI_ID, name: 'Açaí', price: 18 }),
    produto({ id: SUCO_ID, name: 'Suco', price: 10 }),
  ],
};

function cupom(mudancas: Partial<CupomDaLoja> = {}): CupomDaLoja {
  return {
    id: 'cupom-1',
    codigo: 'BEMVINDO10',
    tipo: 'PERCENTUAL',
    percentual: 10,
    valor: null,
    pedidoMinimo: null,
    descontoMaximo: null,
    valeEmPromocao: false,
    produtoIds: [],
    categoriaIds: [],
    ativo: true,
    inicio: null,
    fim: null,
    limiteDeUsos: null,
    limitePorCliente: null,
    usos: 0,
    criadoEm: '2026-09-29T12:00:00.000Z',
    atualizadoEm: '2026-09-29T12:00:00.000Z',
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
  mocks.coupons.mockResolvedValue([]);
});

describe('Marketing — visão geral, cupons', () => {
  it('conta os cupons no ar e os pedidos que usaram cupom', async () => {
    mocks.coupons.mockResolvedValue([
      cupom({ id: 'a', usos: 3 }),
      cupom({ id: 'b', ativo: false, usos: 2 }),
      cupom({ id: 'c', inicio: '2999-01-01' }),
    ]);
    comQuery(<MarketingPage />);

    expect(await screen.findByText(/1 no ar · 5 pedidos usaram cupom/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver cupons' })).toHaveAttribute(
      'href',
      '/loja/marketing/cupons',
    );
  });

  it('sem cupom, convida a criar o primeiro', async () => {
    comQuery(<MarketingPage />);

    expect(await screen.findByText('Você ainda não criou nenhum.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Novo cupom/ })).toHaveAttribute(
      'href',
      '/loja/marketing/cupons/nova',
    );
  });
});

describe('Cupons — a lista', () => {
  it('lista com o código, a situação, o que faz e as regras', async () => {
    mocks.coupons.mockResolvedValue([
      cupom({
        pedidoMinimo: 30,
        descontoMaximo: 15,
        limiteDeUsos: 100,
        usos: 12,
        limitePorCliente: 1,
        produtoIds: [ACAI_ID],
        categoriaIds: [SECAO_ID],
      }),
    ]);
    comQuery(<CuponsPage />);

    expect(await screen.findByText('BEMVINDO10')).toBeInTheDocument();
    expect(screen.getByText('No ar')).toBeInTheDocument();
    expect(screen.getByText('10% de desconto (até R$ 15,00)')).toBeInTheDocument();
    const regras = screen.getByText(/a partir de R\$ 30,00/);
    expect(regras).toHaveTextContent('só em 1 produto e 1 seção');
    expect(regras).toHaveTextContent('só em item sem promoção');
    expect(regras).toHaveTextContent('12 de 100 usos');
    expect(regras).toHaveTextContent('1 uso por cliente');
  });

  it('o cupom de valor fixo e o que vale em promoção dizem isso', async () => {
    mocks.coupons.mockResolvedValue([
      cupom({ tipo: 'VALOR', percentual: null, valor: 5, valeEmPromocao: true }),
    ]);
    comQuery(<CuponsPage />);

    expect(await screen.findByText('R$ 5,00 de desconto')).toBeInTheDocument();
    expect(screen.getByText(/vale em item em promoção/)).toBeInTheDocument();
    expect(screen.getByText(/em todos os itens/)).toBeInTheDocument();
  });

  it('esgotado e desligado aparecem como tal, e o filtro separa', async () => {
    mocks.coupons.mockResolvedValue([
      cupom({ id: 'a', codigo: 'ACABOU', limiteDeUsos: 5, usos: 5 }),
      cupom({ id: 'b', codigo: 'PARADO', ativo: false }),
      cupom({ id: 'c', codigo: 'RODANDO' }),
    ]);
    comQuery(<CuponsPage />);

    expect(await screen.findByText('Esgotado')).toBeInTheDocument();
    expect(screen.getByText('Desligado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /No ar \(1\)/ }));
    expect(screen.getByText('RODANDO')).toBeInTheDocument();
    expect(screen.queryByText('PARADO')).not.toBeInTheDocument();
  });

  it('a busca acha pelo código', async () => {
    mocks.coupons.mockResolvedValue([
      cupom({ id: 'a', codigo: 'BEMVINDO10' }),
      cupom({ id: 'b', codigo: 'FRETE5' }),
    ]);
    comQuery(<CuponsPage />);

    fireEvent.change(await screen.findByLabelText('Buscar cupom'), { target: { value: 'frete' } });

    expect(screen.getByText('FRETE5')).toBeInTheDocument();
    expect(screen.queryByText('BEMVINDO10')).not.toBeInTheDocument();
  });

  it('desligar grava na API', async () => {
    mocks.coupons.mockResolvedValue([cupom()]);
    mocks.setCouponActive.mockResolvedValue(cupom({ ativo: false }));
    comQuery(<CuponsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Desligar' }));

    await waitFor(() =>
      expect(mocks.setCouponActive).toHaveBeenCalledWith('token', 'cupom-1', false),
    );
  });

  it('excluir pede confirmação, e cancelar não apaga', async () => {
    mocks.coupons.mockResolvedValue([cupom()]);
    mocks.deleteCoupon.mockResolvedValue({ deleted: true });
    comQuery(<CuponsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir BEMVINDO10' }));
    expect(mocks.deleteCoupon).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.deleteCoupon).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir BEMVINDO10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(mocks.deleteCoupon).toHaveBeenCalledWith('token', 'cupom-1'));
  });

  it('duplicar manda o id, e a falha aparece com o código do cupom', async () => {
    mocks.coupons.mockResolvedValue([cupom()]);
    mocks.duplicateCoupon.mockRejectedValue(new Error('caiu'));
    comQuery(<CuponsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar BEMVINDO10' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'BEMVINDO10: não foi possível duplicar.',
    );
    expect(mocks.duplicateCoupon).toHaveBeenCalledWith('token', 'cupom-1');
  });

  it('copia o código para passar ao cliente', async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: escrever },
      configurable: true,
    });
    mocks.coupons.mockResolvedValue([cupom()]);
    comQuery(<CuponsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar o código BEMVINDO10' }));

    await waitFor(() => expect(escrever).toHaveBeenCalledWith('BEMVINDO10'));
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
  });

  it('sem cupom, mostra o convite', async () => {
    comQuery(<CuponsPage />);

    expect(await screen.findByText('Nenhum cupom ainda.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Criar cupom/ })).toHaveAttribute(
      'href',
      '/loja/marketing/cupons/nova',
    );
  });
});

describe('Cupons — o formulário', () => {
  it('tocar em criar com o formulário vazio mostra o que falta, campo por campo', async () => {
    comQuery(<FormularioDeCupom />);

    fireEvent.click(await screen.findByRole('button', { name: 'Criar cupom' }));

    expect(
      await screen.findByText('Use de 3 a 20 letras, números, hífen ou sublinhado, sem espaços.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Use um desconto inteiro de 1% a 100%.')).toBeInTheDocument();
    expect(mocks.createCoupon).not.toHaveBeenCalled();
  });

  it('o código vai para maiúsculas e sem espaços enquanto se digita', async () => {
    comQuery(<FormularioDeCupom />);

    const codigo = await screen.findByLabelText('Código');
    fireEvent.change(codigo, { target: { value: 'boas vindas 10' } });

    expect(codigo).toHaveValue('BOASVINDAS10');
  });

  it('cria o cupom com o que foi escolhido e volta para a lista', async () => {
    mocks.createCoupon.mockResolvedValue(cupom());
    comQuery(<FormularioDeCupom />);

    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: 'bemvindo10' } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

    await waitFor(() => expect(mocks.createCoupon).toHaveBeenCalledTimes(1));
    expect(mocks.createCoupon).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        codigo: 'BEMVINDO10',
        tipo: 'PERCENTUAL',
        percentual: 10,
        pedidoMinimo: null,
        descontoMaximo: null,
        inicio: null,
        fim: null,
        limiteDeUsos: null,
        limitePorCliente: null,
        produtoIds: [],
        categoriaIds: [],
        valeEmPromocao: false,
        ativo: true,
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/loja/marketing/cupons'));
  });

  it('cupom de valor fixo manda o valor, e não o percentual', async () => {
    mocks.createCoupon.mockResolvedValue(cupom());
    comQuery(<FormularioDeCupom />);

    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: 'CINCO' } });
    fireEvent.click(screen.getByRole('radio', { name: /Valor fixo/ }));
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), { target: { value: '5,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

    await waitFor(() => expect(mocks.createCoupon).toHaveBeenCalledTimes(1));
    expect(mocks.createCoupon).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ tipo: 'VALOR', valor: 5.5 }),
    );
  });

  it('mostra, antes de salvar, como o cupom fica', async () => {
    comQuery(<FormularioDeCupom />);

    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: 'BEMVINDO10' } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Pedido mínimo/ }));
    fireEvent.change(screen.getByLabelText('A partir de (R$)'), { target: { value: '30' } });

    const resumo = (await screen.findByText('Como fica')).parentElement as HTMLElement;
    expect(
      within(resumo).getByText(/BEMVINDO10: 10% de desconto — a partir de R\$ 30,00/),
    ).toBeInTheDocument();
    expect(within(resumo).getByText(/só em item sem promoção/)).toBeInTheDocument();
  });

  it('as regras extras só aparecem quando se pede', async () => {
    comQuery(<FormularioDeCupom />);

    await screen.findByLabelText('Código');
    expect(screen.queryByLabelText('A partir de (R$)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Quantos pedidos')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Vezes por cliente')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Desconto máximo (R$)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Limitar quantos pedidos/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Limitar por cliente/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Limitar o valor do desconto/ }));

    expect(screen.getByLabelText('Quantos pedidos')).toBeInTheDocument();
    expect(screen.getByLabelText('Vezes por cliente')).toBeInTheDocument();
    expect(screen.getByLabelText('Desconto máximo (R$)')).toBeInTheDocument();
  });

  it('o teto do desconto só existe no cupom em %', async () => {
    comQuery(<FormularioDeCupom />);

    await screen.findByLabelText('Código');
    expect(
      screen.getByRole('checkbox', { name: /Limitar o valor do desconto/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Valor fixo/ }));

    expect(
      screen.queryByRole('checkbox', { name: /Limitar o valor do desconto/ }),
    ).not.toBeInTheDocument();
  });

  it('escolhe onde vale: produtos e seções vão no cupom, e a lista some se voltar a "todos"', async () => {
    mocks.createCoupon.mockResolvedValue(cupom());
    comQuery(<FormularioDeCupom />);

    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: 'SOACAI' } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('radio', { name: /Só em alguns produtos ou seções/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Açaí' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Açaís' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

    await waitFor(() => expect(mocks.createCoupon).toHaveBeenCalledTimes(1));
    expect(mocks.createCoupon).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ produtoIds: [ACAI_ID], categoriaIds: [SECAO_ID] }),
    );

    // Voltando a "todos os itens", o que estava marcado não vai.
    mocks.createCoupon.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: /Em todos os itens/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    await waitFor(() => expect(mocks.createCoupon).toHaveBeenCalledTimes(1));
    expect(mocks.createCoupon).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ produtoIds: [], categoriaIds: [] }),
    );
  });

  it('o limite por cliente maior que o total é recusado, no campo', async () => {
    comQuery(<FormularioDeCupom />);

    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: 'LIMITES' } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Limitar quantos pedidos/ }));
    fireEvent.change(screen.getByLabelText('Quantos pedidos'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Limitar por cliente/ }));
    fireEvent.change(screen.getByLabelText('Vezes por cliente'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

    expect(
      await screen.findByText('O limite por cliente não pode passar do limite total.'),
    ).toBeInTheDocument();
    expect(mocks.createCoupon).not.toHaveBeenCalled();
  });

  it('editar carrega os valores e salva pelo id, mantendo ligado ou desligado', async () => {
    mocks.updateCoupon.mockResolvedValue(cupom({ percentual: 20 }));
    comQuery(<FormularioDeCupom cupom={cupom({ ativo: false, pedidoMinimo: 30 })} />);

    const campo = await screen.findByLabelText('Desconto (%)');
    expect(campo).toHaveValue('10');
    expect(screen.getByLabelText('Código')).toHaveValue('BEMVINDO10');
    // O mínimo já cadastrado aparece marcado, com o valor.
    expect(screen.getByLabelText('A partir de (R$)')).toHaveValue('30,00');

    fireEvent.change(campo, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.updateCoupon).toHaveBeenCalledWith(
        'token',
        'cupom-1',
        expect.objectContaining({ percentual: 20, pedidoMinimo: 30, ativo: false }),
      ),
    );
  });

  it('a recusa do servidor (código repetido) aparece no formulário, sem sair da tela', async () => {
    const { ApiError } = await import('@motoboycity/api-client');
    mocks.createCoupon.mockRejectedValue(
      new ApiError(409, { message: 'Já existe um cupom com o código BEMVINDO10.' }),
    );
    comQuery(<FormularioDeCupom />);

    fireEvent.change(await screen.findByLabelText('Código'), { target: { value: 'BEMVINDO10' } });
    fireEvent.change(screen.getByLabelText('Desconto (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));

    expect(
      await screen.findByText('Já existe um cupom com o código BEMVINDO10.'),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
