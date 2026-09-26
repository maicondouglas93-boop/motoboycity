import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { OperacaoDaLoja, StoreSettings } from '@motoboycity/types';
import { updateStoreIdentitySchema } from '@motoboycity/validation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LojaConfiguracoesPage from '@/app/(app)/loja/configuracoes/page';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * A tela de Configurações fica atrás do login do painel; este teste confere o
 * que cada cartão manda para a API — e que nada do exemplo aparece como se
 * fosse da loja.
 */

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  updateLink: vi.fn(),
  updateIdentity: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
  operation: vi.fn(),
  updatePayments: vi.fn(),
  updateDeliveryAreas: vi.fn(),
  endereco: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  companyStoreSettingsApi: {
    settings: mocks.settings,
    updateLink: mocks.updateLink,
    updateIdentity: mocks.updateIdentity,
    uploadLogo: mocks.uploadLogo,
    removeLogo: mocks.removeLogo,
  },
  companyStoreOperationApi: {
    operation: mocks.operation,
    updatePayments: mocks.updatePayments,
    updateDeliveryAreas: mocks.updateDeliveryAreas,
  },
  companyAddressApi: { get: mocks.endereco },
}));

const LOJA: StoreSettings = {
  slug: 'acai-do-ze',
  name: 'Açaí do Zé',
  suggestedSlug: 'acai-do-ze',
  identity: { theme: 'CLARO', brandColor: '#c2410c', actionColor: '#15803d', logoUrl: null },
  recebePedidos: false,
};

const OPERACAO: OperacaoDaLoja = {
  ...OPERACAO_DE_EXEMPLO,
  pagamentos: ['DINHEIRO'],
  bairros: [{ id: 'b1', nome: 'Centro', taxa: 6 }],
};

function abrir() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LojaConfiguracoesPage />
    </QueryClientProvider>,
  );
}

/** O cartão pelo título, para não confundir o "Salvar" de um com o de outro. */
async function cartao(titulo: string): Promise<HTMLElement> {
  const cabecalho = await screen.findByText(titulo);
  const elemento = cabecalho.closest('[data-slot="card"]');
  if (!(elemento instanceof HTMLElement)) throw new Error(`Cartão não encontrado: ${titulo}`);
  return elemento;
}

beforeEach(() => {
  window.localStorage.setItem('motoboycity.accessToken', 'token');
  mocks.settings.mockResolvedValue(LOJA);
  mocks.operation.mockResolvedValue(OPERACAO);
  // Como o servidor: as cores passam pelo mesmo schema, que as põe em minúsculas.
  mocks.updateIdentity.mockImplementation((_token: string, cores: unknown) =>
    Promise.resolve({
      ...LOJA,
      identity: { ...LOJA.identity, ...updateStoreIdentitySchema.parse(cores) },
    }),
  );
  mocks.updatePayments.mockImplementation((_token: string, bloco: object) =>
    Promise.resolve({ ...OPERACAO, ...bloco }),
  );
  mocks.updateDeliveryAreas.mockImplementation((_token: string, bloco: object) =>
    Promise.resolve({ ...OPERACAO, ...bloco }),
  );
  mocks.endereco.mockResolvedValue({
    address: {
      id: 'e1',
      label: null,
      street: 'Rua da Empresa',
      number: '12',
      complement: null,
      city: 'Lajinha',
      state: 'MG',
      zip: '36980-000',
      lat: null,
      lng: null,
    },
  });
});

describe('Configurações — identidade visual', () => {
  it('cor que some contra o fundo aparece em vermelho e não salva', async () => {
    abrir();
    const identidade = await cartao('Identidade visual');
    const marca = await within(identidade).findByLabelText('Cor da marca em hexadecimal');

    fireEvent.change(marca, { target: { value: '#facc15' } });

    expect(within(identidade).getByRole('alert')).toHaveTextContent('Escolha um tom mais escuro');
    expect(within(identidade).getByRole('button', { name: 'Salvar aparência' })).toBeDisabled();
  });

  it('o tema e as cores vão para o sistema', async () => {
    abrir();
    const identidade = await cartao('Identidade visual');
    fireEvent.click(await within(identidade).findByLabelText('Escuro'));
    fireEvent.change(within(identidade).getByLabelText('Cor da marca em hexadecimal'), {
      target: { value: '#FBBF24' },
    });
    fireEvent.change(within(identidade).getByLabelText('Cor de ação em hexadecimal'), {
      target: { value: '#22c55e' },
    });
    fireEvent.click(within(identidade).getByRole('button', { name: 'Salvar aparência' }));

    await waitFor(() =>
      expect(mocks.updateIdentity).toHaveBeenCalledWith('token', {
        theme: 'ESCURO',
        brandColor: '#FBBF24',
        actionColor: '#22c55e',
      }),
    );
    expect(await within(identidade).findByText('Tudo salvo.')).toBeInTheDocument();
  });

  it('sem link, a aparência não salva e diz por quê', async () => {
    mocks.settings.mockResolvedValue({ ...LOJA, slug: null });
    abrir();
    const identidade = await cartao('Identidade visual');
    expect(
      await within(identidade).findByText(/Crie o link da loja, acima, para salvar a aparência/),
    ).toBeInTheDocument();
    expect(within(identidade).getByRole('button', { name: 'Enviar logo' })).toBeDisabled();
  });
});

describe('Configurações — pagamento', () => {
  it('online fica travado sem a conta Asaas; na entrega, grava o que for marcado', async () => {
    abrir();
    const pagamento = await cartao('Formas de pagamento');
    expect(await within(pagamento).findByLabelText('Pix')).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(within(pagamento).getByLabelText('Débito na maquininha'));
    fireEvent.click(within(pagamento).getByRole('button', { name: 'Salvar formas de pagamento' }));

    await waitFor(() =>
      expect(mocks.updatePayments).toHaveBeenCalledWith('token', {
        pagamentos: ['DINHEIRO', 'DEBITO_MAQUININHA'],
      }),
    );
  });
});

describe('Configurações — bairros', () => {
  it('bairro repetido, até com maiúscula, é apontado antes de salvar', async () => {
    abrir();
    const bairros = await cartao('Bairros que você atende');
    fireEvent.click(await within(bairros).findByRole('button', { name: /Acrescentar bairro/ }));
    const nomes = within(bairros).getAllByLabelText('Nome do bairro');
    fireEvent.change(nomes[1]!, { target: { value: ' CENTRO ' } });
    fireEvent.change(within(bairros).getByLabelText('Taxa de CENTRO'), {
      target: { value: '8,00' },
    });

    expect(within(bairros).getByRole('alert')).toHaveTextContent('CENTRO aparece duas vezes.');
    expect(within(bairros).getByRole('button', { name: 'Salvar bairros' })).toBeDisabled();
  });

  it('duas linhas em branco dão um aviso só, e ele some quando elas são preenchidas', async () => {
    abrir();
    const bairros = await cartao('Bairros que você atende');
    const acrescentar = await within(bairros).findByRole('button', { name: /Acrescentar bairro/ });
    fireEvent.click(acrescentar);
    fireEvent.click(acrescentar);

    expect(
      within(bairros)
        .getAllByRole('alert')
        .filter((aviso) => aviso.textContent === 'Um bairro está sem nome.'),
    ).toHaveLength(1);

    const [, primeira, segunda] = within(bairros).getAllByLabelText('Nome do bairro');
    fireEvent.change(primeira!, { target: { value: 'Vila Nova' } });
    fireEvent.change(segunda!, { target: { value: 'Alto' } });
    fireEvent.change(within(bairros).getByLabelText('Taxa de Vila Nova'), {
      target: { value: '8' },
    });
    fireEvent.change(within(bairros).getByLabelText('Taxa de Alto'), { target: { value: '9' } });

    expect(within(bairros).queryAllByRole('alert')).toHaveLength(0);
    expect(within(bairros).getByRole('button', { name: 'Salvar bairros' })).toBeEnabled();
  });

  it('a taxa digitada em reais vai como número', async () => {
    abrir();
    const bairros = await cartao('Bairros que você atende');
    fireEvent.click(await within(bairros).findByRole('button', { name: /Acrescentar bairro/ }));
    fireEvent.change(within(bairros).getAllByLabelText('Nome do bairro')[1]!, {
      target: { value: 'Vila Nova' },
    });
    fireEvent.change(within(bairros).getByLabelText('Taxa de Vila Nova'), {
      target: { value: '9,50' },
    });
    fireEvent.click(within(bairros).getByRole('button', { name: 'Salvar bairros' }));

    await waitFor(() => expect(mocks.updateDeliveryAreas).toHaveBeenCalledOnce());
    const [, bloco] = mocks.updateDeliveryAreas.mock.calls[0] as [string, OperacaoDaLoja];
    expect(bloco.bairros).toEqual([
      { id: 'b1', nome: 'Centro', taxa: 6 },
      { id: expect.any(String), nome: 'Vila Nova', taxa: 9.5 },
    ]);
  });
});

describe('Configurações — nada do exemplo', () => {
  it('o ponto de coleta é o endereço da empresa', async () => {
    abrir();
    const coleta = await cartao('De onde o motoboy retira');
    expect(await within(coleta).findByText('Rua da Empresa, 12')).toBeInTheDocument();
    expect(screen.queryByText(/Coronel Pedro Alves|Alto da Serra|a1b2/)).not.toBeInTheDocument();
  });
});
