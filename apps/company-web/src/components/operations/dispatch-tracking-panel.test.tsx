import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { DeliveryStatus, OperationalDeliveryItem } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authUserQueryKey } from '@/lib/auth-user-query';
import { session } from '@/lib/session';
import { printDelivery, printUser } from '@/test/delivery-print-fixture';
import {
  deliveryUpdateTouchesTracking,
  DispatchTrackingPanel,
  dispatchTrackingNeedsRecovery,
} from './dispatch-tracking-panel';

const mocks = vi.hoisted(() => ({
  operations: vi.fn(),
  profile: vi.fn(),
  io: vi.fn(),
  socketOn: vi.fn(),
  socketDisconnect: vi.fn(),
  socketListeners: new Map<string, (payload?: unknown) => void>(),
}));

vi.mock('socket.io-client', () => ({ io: mocks.io }));

vi.mock('@/lib/api-client', () => ({
  apiBaseUrl: 'https://api.example.test',
  companyProfileApi: { get: mocks.profile },
  deliveriesApi: {
    operations: mocks.operations,
    cancel: vi.fn(),
    redispatch: vi.fn(),
  },
}));

function pedido(id: string, status: DeliveryStatus, comEntregador = false) {
  return {
    id,
    displayNumber: Number(id.replace(/\D/g, '')) || 1,
    companyId: printDelivery.companyId,
    status,
    batchId: 'lote-1',
    statusChangedAt: new Date().toISOString(),
    driver: comEntregador
      ? { id: 'driver-1', name: 'Zé da Moto', phone: '33999887799', avatarUrl: null }
      : null,
    addresses: [],
  } as unknown as OperationalDeliveryItem;
}

function montar(props: {
  deliveryIds: string[];
  creating?: boolean;
  allowActions?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(authUserQueryKey, printUser);
  render(
    <QueryClientProvider client={queryClient}>
      <DispatchTrackingPanel
        token="token"
        deliveryIds={props.deliveryIds}
        batchId="lote-1"
        creating={props.creating ?? false}
        allowActions={props.allowActions ?? true}
        detailHref={(id) => `/pedidos/${id}`}
      />
    </QueryClientProvider>,
  );
}

/** O radar se anuncia pelo `aria-label` — é por ele que o teste lê o estado. */
const PROCURANDO = 'Procurando um entregador disponível';
const ENCONTRADO = 'Entregador encontrado';
const ENCERRADO = 'Busca encerrada';

describe('acompanhamento do despacho', () => {
  beforeEach(() => {
    session.setToken('token');
    mocks.profile.mockReset().mockResolvedValue({ companyId: printDelivery.companyId });
    mocks.operations.mockReset();
    mocks.io.mockReset();
    mocks.socketOn.mockReset();
    mocks.socketDisconnect.mockReset();
    mocks.socketListeners.clear();
    mocks.socketOn.mockImplementation(
      (event: string, listener: (payload?: unknown) => void) => {
        mocks.socketListeners.set(event, listener);
      },
    );
    mocks.io.mockReturnValue({
      on: mocks.socketOn,
      disconnect: mocks.socketDisconnect,
    });
    mocks.operations.mockResolvedValue({ active: [], recent: [], counts: {} });
  });

  it('sabe quando o polling de seguranca ainda e necessario', () => {
    expect(
      dispatchTrackingNeedsRecovery(
        { active: [pedido('1', 'AWAITING_DRIVER')], recent: [], counts: {} },
        ['1'],
      ),
    ).toBe(true);
    expect(
      dispatchTrackingNeedsRecovery(
        { active: [pedido('1', 'ACCEPTED', true)], recent: [], counts: {} },
        ['1'],
      ),
    ).toBe(false);
    expect(
      dispatchTrackingNeedsRecovery(
        { active: [pedido('1', 'ACCEPTED', true)], recent: [], counts: {} },
        ['1', '2'],
      ),
    ).toBe(true);
  });

  it('filtra eventos alheios sem depender de um unico formato de payload', () => {
    expect(deliveryUpdateTouchesTracking({ id: '1' }, ['1'], null)).toBe(true);
    expect(deliveryUpdateTouchesTracking({ deliveryId: '1' }, ['1'], null)).toBe(true);
    expect(deliveryUpdateTouchesTracking({ id: '2' }, ['1'], null)).toBe(false);
    expect(deliveryUpdateTouchesTracking({ batchId: 'lote-1' }, ['1'], 'lote-1')).toBe(true);
    expect(deliveryUpdateTouchesTracking({ batchId: 'lote-2' }, ['1'], 'lote-1')).toBe(false);
  });

  it('já procura enquanto a criação está no ar', () => {
    montar({ deliveryIds: [], creating: true });

    expect(screen.getByRole('img', { name: PROCURANDO })).toBeVisible();
    expect(screen.getByText('Enviando o pedido e iniciando a busca por um entregador...'));
    // Sem id ainda, não há o que consultar.
    expect(mocks.operations).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Imprimir pedido' })).not.toBeInTheDocument();
  });

  it('continua procurando enquanto o pedido está sem entregador', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'AWAITING_DRIVER')],
      recent: [],
      counts: {},
    });
    montar({ deliveryIds: ['1'] });

    expect(await screen.findByText('#1')).toBeVisible();
    expect(screen.getByRole('img', { name: PROCURANDO })).toBeVisible();
  });

  it('vira "encontrado" quando o entregador aceita', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'ACCEPTED', true)],
      recent: [],
      counts: {},
    });
    montar({ deliveryIds: ['1'] });

    expect(await screen.findByRole('img', { name: ENCONTRADO })).toBeVisible();
    expect(screen.getByText('Entregador a caminho.')).toBeVisible();
    expect(screen.getByText('Zé da Moto')).toBeVisible();
    const print = await screen.findByRole('link', { name: 'Imprimir pedido' });
    expect(print).toHaveAttribute('href', '/pedidos/1/imprimir');
    expect(print).toHaveAttribute('target', '_blank');
    expect(print).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Abrir detalhes' })).toBeVisible();
  });

  it('oferece impressao individual para cada pedido do lote sem alterar a busca', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'ACCEPTED', true), pedido('2', 'AWAITING_DRIVER')],
      recent: [], counts: {},
    });
    montar({ deliveryIds: ['1', '2'] });
    expect(await screen.findAllByRole('link', { name: 'Imprimir pedido' })).toHaveLength(2);
    const cards = screen.getAllByRole('listitem');
    cards.forEach((card, index) => {
      expect(within(card).getByRole('link', { name: 'Imprimir pedido' }))
        .toHaveAttribute('href', `/pedidos/${index + 1}/imprimir`);
    });
    expect(screen.getByRole('img', { name: PROCURANDO })).toBeVisible();
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });

  it('nao oferece impressao para pedido de outra empresa', async () => {
    mocks.operations.mockResolvedValue({
      active: [{ ...pedido('1', 'ACCEPTED', true), companyId: 'other-company' }],
      recent: [], counts: {},
    });
    montar({ deliveryIds: ['1'] });
    await screen.findByText('Zé da Moto');
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Imprimir pedido' })).not.toBeInTheDocument();
  });

  it('refaz uma unica consulta quando o socket avisa do aceite em rajada', async () => {
    mocks.operations
      .mockResolvedValueOnce({
        active: [pedido('1', 'AWAITING_DRIVER')],
        recent: [],
        counts: {},
      })
      .mockResolvedValue({
        active: [pedido('1', 'ACCEPTED', true)],
        recent: [],
        counts: {},
      });
    montar({ deliveryIds: ['1'] });

    await screen.findByRole('img', { name: PROCURANDO });
    await act(async () => {
      mocks.socketListeners.get('delivery:updated')?.({ id: '1' });
      mocks.socketListeners.get('delivery:updated')?.({ id: '1' });
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    await waitFor(() => expect(mocks.operations).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('img', { name: ENCONTRADO })).toBeVisible();
  });

  it('cancelado encerra a busca em vez de girar para sempre', async () => {
    mocks.operations.mockResolvedValue({
      active: [],
      recent: [pedido('1', 'CANCELLED')],
      counts: {},
    });
    montar({ deliveryIds: ['1'] });

    expect(await screen.findByRole('img', { name: ENCERRADO })).toBeVisible();
    expect(screen.getByText('Pedido cancelado.')).toBeVisible();
  });

  /**
   * O caso que motivou separar "estado" de "quantidade": num lote com um
   * aceito e um ainda na fila, declarar "encontrado" faria a tela dizer que
   * acabou enquanto metade do lote continua sem ninguém.
   */
  it('num lote pela metade, continua procurando', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'ACCEPTED', true), pedido('2', 'AWAITING_DRIVER')],
      recent: [],
      counts: {},
    });
    montar({ deliveryIds: ['1', '2'] });

    expect(await screen.findByText('1 de 2 ainda procurando entregador.')).toBeVisible();
    expect(screen.getByRole('img', { name: PROCURANDO })).toBeVisible();
  });

  /**
   * Enquanto a consulta não devolveu TODOS os pedidos do lote, o radar não pode
   * concluir nada: com um só na mão ele diria "encontrado" por causa de um
   * pedido, escondendo os outros que ainda não chegaram.
   */
  it('não conclui com o lote incompleto na resposta', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'ACCEPTED', true)],
      recent: [],
      counts: {},
    });
    montar({ deliveryIds: ['1', '2'] });

    expect(await screen.findByText('Atualizando o andamento de todos os pedidos...')).toBeVisible();
    expect(screen.getByRole('img', { name: PROCURANDO })).toBeVisible();
  });

  /**
   * A API só aceita cancelamento da empresa antes do aceite. Oferecer o botão
   * depois seria oferecer uma ação que volta erro.
   */
  it('esconde cancelar e chamar de novo depois do aceite', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'ACCEPTED', true)],
      recent: [],
      counts: {},
    });
    montar({ deliveryIds: ['1'] });

    await screen.findByText('Zé da Moto');
    expect(screen.queryByRole('button', { name: /Cancelar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Chamar de novo/ })).toBeNull();
  });

  it('não mostra ações nenhuma quando o painel é só de leitura', async () => {
    mocks.operations.mockResolvedValue({
      active: [pedido('1', 'AWAITING_DRIVER')],
      recent: [],
      counts: {},
    });
    montar({ deliveryIds: ['1'], allowActions: false });

    await screen.findByText('#1');
    expect(screen.queryByRole('button', { name: /Cancelar/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir detalhes' })).toBeVisible();
  });
});
