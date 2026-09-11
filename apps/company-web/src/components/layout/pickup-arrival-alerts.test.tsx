import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PickupArrivalAlerts } from './pickup-arrival-alerts';

const socketMock = vi.hoisted(() => ({
  clients: [] as {
    handlers: Record<string, (event: unknown) => void>;
    disconnect: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('socket.io-client', () => ({
  io: () => {
    const client = {
      handlers: {} as Record<string, (event: unknown) => void>,
      disconnect: vi.fn(),
      off: vi.fn(),
      on: vi.fn(),
    };
    client.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
      client.handlers[event] = handler;
    });
    socketMock.clients.push(client);
    return client;
  },
}));
vi.mock('@/lib/api-client', () => ({ apiBaseUrl: 'http://127.0.0.1:3333' }));

const startTone = vi.fn();
const closeAudio = vi.fn();
class TestAudio {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
  addEventListener(_name: string, callback: () => void) {
    this.onstatechange = callback;
  }
  async resume() {
    this.state = 'running';
    this.onstatechange?.();
  }
  async suspend() {
    this.state = 'suspended';
    this.onstatechange?.();
  }
  async close() {
    closeAudio();
    this.state = 'closed';
  }
  createOscillator() {
    return {
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: startTone,
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}
const event = () => ({
  deliveryId: 'b3fd7883-3ab1-4b1b-b19a-ff3d08100693',
  displayNumber: 777,
  driverId: '89145dc8-a3d1-4477-917d-e9cecae14911',
  arrivedAt: new Date().toISOString(),
});
const emit = (payload: unknown, index = 0) =>
  act(() => socketMock.clients[index]!.handlers['delivery:pickup-arrival']!(payload));
const mount = (userId = 'company-user') =>
  render(<PickupArrivalAlerts token="test-only" userId={userId} />);

describe('PickupArrivalAlerts', () => {
  beforeEach(() => {
    socketMock.clients = [];
    startTone.mockClear();
    closeAudio.mockClear();
    vi.stubGlobal('AudioContext', TestAudio);
  });

  it('mostra aviso visual sem tocar antes da ativacao pelo usuario', () => {
    mount();
    emit(event());
    expect(screen.getByText('Motoboy próximo da loja')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver pedido' })).toHaveAttribute(
      'href',
      `/pedidos/${event().deliveryId}`,
    );
    expect(startTone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso do pedido 777' }));
    expect(screen.queryByText('Motoboy próximo da loja')).not.toBeInTheDocument();
  });

  it('testa som, toca uma vez por pedido e permite silenciar', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar e testar som de chegada' }));
    await waitFor(() => expect(startTone).toHaveBeenCalledTimes(3));
    const arrival = event();
    emit(arrival);
    emit(arrival);
    expect(startTone).toHaveBeenCalledTimes(6);
    expect(screen.getAllByText('Motoboy próximo da loja')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Desativar som de chegada' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Ativar e testar som de chegada' }),
      ).toHaveAttribute('aria-pressed', 'false'),
    );
    emit({ ...event(), deliveryId: '010feae5-39b1-4c6c-a139-7a5362c6ba29' });
    expect(startTone).toHaveBeenCalledTimes(6);
  });

  it('nao deixa uma aba muda consumir o som de uma aba habilitada', async () => {
    const muted = mount();
    emit(event());
    muted.unmount();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar e testar som de chegada' }));
    await waitFor(() => expect(startTone).toHaveBeenCalledTimes(3));
    emit(event(), 1);
    expect(startTone).toHaveBeenCalledTimes(6);
  });

  it('mantem deduplicacao sonora ao remontar na mesma conta', async () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar e testar som de chegada' }));
    await waitFor(() => expect(startTone).toHaveBeenCalledTimes(3));
    emit(event());
    view.unmount();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar e testar som de chegada' }));
    await waitFor(() => expect(startTone).toHaveBeenCalledTimes(9));
    emit(event(), 1);
    expect(startTone).toHaveBeenCalledTimes(9);
    expect(closeAudio).toHaveBeenCalledTimes(1);
    expect(socketMock.clients[0]!.disconnect).toHaveBeenCalled();
  });

  it('ignora eventos invalidos, antigos e futuros', () => {
    mount();
    emit({ deliveryId: 'invalid' });
    emit({ ...event(), arrivedAt: new Date(Date.now() - 61_000).toISOString() });
    emit({ ...event(), arrivedAt: new Date(Date.now() + 10_000).toISOString() });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falha de audio nao interrompe o aviso visual', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar e testar som de chegada' }));
    await screen.findByText(/Não foi possível ativar o som/);
    emit(event());
    expect(screen.getByText('Motoboy próximo da loja')).toBeVisible();
  });

  it('nao conecta sem sessao', () => {
    render(<PickupArrivalAlerts token={null} userId="" />);
    expect(socketMock.clients).toHaveLength(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('remove aviso visual quando o pedido e coletado', () => {
    mount();
    emit(event());
    act(() =>
      socketMock.clients[0]!.handlers['delivery:updated']!({
        id: event().deliveryId,
        status: 'COLLECTED',
      }),
    );
    expect(screen.queryByText('Motoboy próximo da loja')).not.toBeInTheDocument();
  });
});
