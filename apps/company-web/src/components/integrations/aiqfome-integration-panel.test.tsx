import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanyAiqfomeIntegration } from '@motoboycity/types';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiqfomeIntegrationPanel } from './aiqfome-integration-panel';

const mocks = vi.hoisted(() => ({
  getAiqfome: vi.fn<() => Promise<CompanyAiqfomeIntegration>>(),
  connectAiqfome: vi.fn(),
  disconnectAiqfome: vi.fn(),
  updateAiqfomeSettings: vi.fn(),
  serviceTypes: vi.fn(),
  getToken: vi.fn<() => string | null>(),
}));

vi.mock('@/lib/api-client', () => ({
  companyIntegrationsApi: {
    getAiqfome: mocks.getAiqfome,
    connectAiqfome: mocks.connectAiqfome,
    disconnectAiqfome: mocks.disconnectAiqfome,
    updateAiqfomeSettings: mocks.updateAiqfomeSettings,
  },
  serviceTypesApi: { list: mocks.serviceTypes },
}));

vi.mock('@/lib/session', () => ({
  session: { getToken: mocks.getToken },
}));

const disconnected: CompanyAiqfomeIntegration = {
  provider: 'AIQFOME',
  status: 'DISCONNECTED',
  configured: true,
  operationalReady: false,
  canManage: true,
  store: null,
  dispatchTrigger: 'NEW_ORDER_DELAYED',
  acceptedPayment: 'PREPAID_AND_ON_DELIVERY',
  serviceTypeId: null,
  dispatchDelayMinutes: null,
  effectiveDispatchDelayMinutes: null,
  delaySource: null,
  webhookStatus: 'INACTIVE',
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
    mocks.updateAiqfomeSettings.mockReset();
    mocks.serviceTypes.mockReset().mockResolvedValue([]);
    window.history.replaceState({}, '', '/integracoes');
  });

  it('mostra o vinculo seguro e as regras aprovadas do piloto', async () => {
    mocks.getAiqfome.mockResolvedValue(disconnected);
    renderPanel();

    expect(await screen.findByRole('button', { name: 'Conectar com aiqfome' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Como conectar sua loja aiqfome' })).toBeVisible();
    expect(screen.getByText(/No menu do Geraldo, abra Integrações/i)).toBeVisible();
    expect(screen.getByText(/Clique em Vincular ID Magalu/i)).toBeVisible();
    expect(screen.getByText(/Autorize somente uma loja/i)).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('link', { name: /Guia oficial do aiqfome/i })).toHaveAttribute(
      'href',
      'https://developer.aiqfome.com/docs/guides/opendelivery/authentication',
    );
    expect(screen.getByRole('link', { name: /Guia oficial do aiqfome/i })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByText('Próximo passo: prepare a loja no Geraldo')).toBeVisible();
    expect(screen.getByText('Novo pedido fica agendado')).toBeVisible();
    expect(screen.getByText('Online sem retorno; na entrega com retorno')).toBeVisible();
    expect(screen.getByText(/tokens da loja ficam criptografados/i)).toBeVisible();
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
    expect(screen.getByText('Loja conectada: falta ativar a importação')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desconectar loja' })).toBeEnabled();
    expect(screen.queryByText(/access-secret|refresh-secret/i)).not.toBeInTheDocument();
  });

  it('confirma quando o vínculo e a importação estão operacionais', async () => {
    mocks.getAiqfome.mockResolvedValue({
      ...disconnected,
      status: 'CONNECTED',
      operationalReady: true,
      serviceTypeId: 'service-1',
      effectiveDispatchDelayMinutes: 15,
      delaySource: 'ADMIN',
      webhookStatus: 'ACTIVE',
      store: {
        id: '54044',
        name: 'Loja Teste',
        status: 'OPEN',
        document: '12345678000190',
        address: null,
      },
    });
    renderPanel();

    expect(await screen.findByText('Integração pronta para receber pedidos')).toBeVisible();
    expect(screen.getByText('Importação ativa')).toBeVisible();
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

  it('orienta a autorizar apenas uma loja quando o provedor devolve mais de uma', async () => {
    mocks.getAiqfome.mockResolvedValue(disconnected);
    renderPanel({ callbackStatus: 'error', callbackReason: 'STORE_COUNT_INVALID' });

    expect(
      await screen.findByText('Autorize somente uma loja por vez no aiqfome e tente novamente.'),
    ).toBeVisible();
  });
});
