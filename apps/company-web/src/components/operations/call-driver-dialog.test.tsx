import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallDriverDialog } from './call-driver-dialog';

const mocks = vi.hoisted(() => ({
  address: vi.fn(),
  create: vi.fn(),
  createBatch: vi.fn(),
  operations: vi.fn(),
  serviceTypes: vi.fn(),
  businessHours: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiBaseUrl: 'https://api.example.test',
  companyAddressApi: { get: mocks.address },
  deliveriesApi: {
    create: mocks.create,
    createBatch: mocks.createBatch,
    operations: mocks.operations,
    cancel: vi.fn(),
    redispatch: vi.fn(),
  },
  serviceTypesApi: { list: mocks.serviceTypes },
  companyBusinessHoursApi: { status: mocks.businessHours },
}));

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('@/lib/session', () => ({
  session: { getToken: () => 'token' },
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CallDriverDialog>
        <button type="button">Chamar entregador</button>
      </CallDriverDialog>
    </QueryClientProvider>,
  );
}

describe('CallDriverDialog', () => {
  beforeEach(() => {
    mocks.operations.mockReset();
    mocks.operations.mockResolvedValue({ active: [], recent: [], counts: {} });
    mocks.address.mockResolvedValue({
      address: {
        id: 'pickup-1',
        label: null,
        street: 'Rua da Loja',
        number: '1',
        complement: null,
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
        lat: -20.14,
        lng: -41.61,
      },
    });
    mocks.serviceTypes.mockResolvedValue([
      {
        id: 'service-1',
        code: 'MOTO',
        name: 'Moto',
        active: true,
        createdAt: '2026-08-27T12:00:00.000Z',
      },
    ]);
    mocks.create.mockImplementation(() => new Promise(() => undefined));
    mocks.businessHours.mockResolvedValue({
      accepting: true,
      nextOpeningLabel: null,
      todayWindows: [],
    });
  });

  /**
   * Fora do horário a API recusa com 409. Deixar o botão ativo transformaria
   * uma informação que já está na tela em erro depois do clique.
   */
  it('trava o envio e diz quando reabre, fora do horário', async () => {
    mocks.businessHours.mockResolvedValue({
      accepting: false,
      nextOpeningLabel: 'amanhã às 08:00',
      todayWindows: [{ startMinute: 480, endMinute: 1080 }],
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Chamar entregador' }));
    await screen.findByText('Atendimento fechado agora.');

    expect(screen.getByText('Reabre amanhã às 08:00.')).toBeVisible();
    expect(screen.getByText('Hoje: 08:00–18:00')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Chamar entregador' })).toBeDisabled(),
    );
  });

  /**
   * Se a consulta do horário falhar, quem decide continua sendo a API: um
   * botão travado por uma consulta secundária que caiu impediria a loja de
   * trabalhar num horário em que ela pode.
   */
  it('não trava o envio quando a consulta do horário falha', async () => {
    mocks.businessHours.mockRejectedValue(new Error('rede'));
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Chamar entregador' }));
    await screen.findByText('Moto');

    expect(screen.getByRole('button', { name: 'Chamar entregador' })).toBeEnabled();
    expect(screen.queryByText('Atendimento fechado agora.')).toBeNull();
  });

  it('mostra o acompanhamento imediatamente enquanto a API cria o pedido', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Chamar entregador' }));
    await screen.findByText('Moto');
    fireEvent.click(screen.getByRole('button', { name: 'Chamar entregador' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: 'Acompanhando' })).toBeVisible();
    expect(
      screen.getByText('Enviando o pedido e iniciando a busca por um entregador...'),
    ).toBeVisible();
    /**
     * O radar tem que estar PROCURANDO já aqui, e não só depois que a API
     * responde: se ele esperasse a confirmação, a tela ficaria parada
     * justamente no trecho em que a pessoa está olhando para ela.
     */
    expect(screen.getByRole('img', { name: 'Procurando um entregador disponível' })).toBeVisible();
  });
});
