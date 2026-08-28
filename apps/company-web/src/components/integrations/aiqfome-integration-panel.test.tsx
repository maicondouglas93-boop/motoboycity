import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyAiqfomeIntegration } from '@motoboycity/types';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiqfomeIntegrationPanel } from './aiqfome-integration-panel';

const mocks = vi.hoisted(() => ({
  getAiqfome: vi.fn<() => Promise<CompanyAiqfomeIntegration>>(),
  connectAiqfome: vi.fn(),
  disconnectAiqfome: vi.fn(),
  getToken: vi.fn<() => string | null>(),
}));

vi.mock('@/lib/api-client', () => ({
  companyIntegrationsApi: {
    getAiqfome: mocks.getAiqfome,
    connectAiqfome: mocks.connectAiqfome,
    disconnectAiqfome: mocks.disconnectAiqfome,
  },
}));

vi.mock('@/lib/session', () => ({
  session: { getToken: mocks.getToken },
}));

const disconnected: CompanyAiqfomeIntegration = {
  provider: 'AIQFOME',
  status: 'DISCONNECTED',
  configured: true,
  canManage: true,
  store: null,
  dispatchTrigger: 'READY_ORDER',
  acceptedPayment: 'PREPAID_ONLY',
  connectedAt: null,
  lastSyncAt: null,
  errorCode: null,
};

function renderPanel(props?: { callbackStatus?: string; callbackReason?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiqfomeIntegrationPanel {...props} />
    </QueryClientProvider>,
  );
}

describe('AiqfomeIntegrationPanel', () => {
  beforeEach(() => {
    mocks.getToken.mockReturnValue('token');
    mocks.getAiqfome.mockReset();
    mocks.connectAiqfome.mockReset();
    mocks.disconnectAiqfome.mockReset();
    window.history.replaceState({}, '', '/integracoes');
  });

  it('mostra o vinculo seguro e as regras aprovadas do piloto', async () => {
    mocks.getAiqfome.mockResolvedValue(disconnected);
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Conectar com aiqfome' })).toBeEnabled();
    expect(screen.getByText('Quando o pedido estiver pronto')).toBeVisible();
    expect(screen.getByText('Somente pago online')).toBeVisible();
    expect(screen.getByText(/tokens da loja ficam criptografados/i)).toBeVisible();
    expect(screen.getByText(/nenhum pedido é importado/i)).toBeVisible();
  });

  it('identifica a loja conectada sem mostrar credenciais', async () => {
    mocks.getAiqfome.mockResolvedValue({
      ...disconnected,
      status: 'CONNECTED',
      store: {
        id: '54044',
        name: 'Loja Teste',
        status: 'OPEN',
        document: '12345678000190',
        address: { street: 'Rua A', number: '10', city: 'Lajinha', state: 'MG' },
      },
      connectedAt: '2026-08-27T20:00:00.000Z',
    });
    renderPanel();

    expect(await screen.findByText('Loja Teste')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desconectar loja' })).toBeEnabled();
    expect(screen.queryByText(/access-secret|refresh-secret/i)).not.toBeInTheDocument();
  });

  it('bloqueia a conexao para operador da empresa', async () => {
    mocks.getAiqfome.mockResolvedValue({ ...disconnected, canManage: false });
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Conectar com aiqfome' })).toBeDisabled();
    expect(screen.getByText(/somente o responsável principal/i)).toBeVisible();
  });

  it('so confirma o callback conectado depois de consultar o estado real', async () => {
    mocks.getAiqfome.mockResolvedValue(disconnected);
    renderPanel({ callbackStatus: 'connected' });

    expect(await screen.findByRole('button', { name: 'Conectar com aiqfome' })).toBeEnabled();
    expect(screen.queryByText('Loja aiqfome conectada com segurança.')).not.toBeInTheDocument();
  });
});
