import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@motoboycity/api-client';
import type { AjusteManual, OperacaoDaLoja } from '@motoboycity/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControleDoStatus } from '@/components/loja/controle-do-status';
import { OPERACAO_DE_EXEMPLO } from '@/lib/loja-mock';

/**
 * O status da loja fica atrás do login do painel; este teste confere o que
 * vai para a API e o que o painel mostra quando ela responde.
 */

const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ companyStoreOperationApi: mocks }));

/** Quarta-feira, meio-dia na hora da loja (Brasília, UTC-3). */
const MEIO_DIA = new Date('2026-09-23T12:00:00-03:00');
const MINUTO = 60_000;

function operacaoCom(ajuste: AjusteManual | null): OperacaoDaLoja {
  return {
    ...OPERACAO_DE_EXEMPLO,
    funcionamento: {
      semana: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        dia,
        faixas: [{ abre: '11:00', fecha: '14:00' }],
      })),
      excecoes: [],
      ajuste,
      mensagemFechada: '',
    },
  };
}

function abrir() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ControleDoStatus />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MEIO_DIA);
  window.localStorage.setItem('motoboycity.accessToken', 'token');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Status da loja', () => {
  it('pausar manda só o fim; o começo é do servidor, e o painel já mostra a pausa', async () => {
    mocks.operation.mockResolvedValue(operacaoCom(null));
    // O servidor marca o começo quando a gravação chega — um pouco depois do
    // clique, na hora dele.
    mocks.updateStatus.mockImplementation(
      (_token: string, { ajuste }: { ajuste: Omit<AjusteManual, 'desde'> }) =>
        Promise.resolve(
          operacaoCom({ ...ajuste, desde: new Date(MEIO_DIA.getTime() + 2_000).toISOString() }),
        ),
    );
    abrir();
    expect(await screen.findByText('Aberta')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    fireEvent.click(screen.getByRole('button', { name: '15 min' }));

    await waitFor(() =>
      expect(mocks.updateStatus).toHaveBeenCalledWith('token', {
        ajuste: {
          estado: 'PAUSADA',
          ate: new Date(MEIO_DIA.getTime() + 15 * MINUTO).toISOString(),
        },
      }),
    );
    expect(await screen.findByText('Pausada')).toBeInTheDocument();
    expect(screen.getByText('pedidos voltam às 12:15')).toBeInTheDocument();
  });

  it('retomar devolve a loja ao horário', async () => {
    mocks.operation.mockResolvedValue(
      operacaoCom({
        estado: 'PAUSADA',
        desde: new Date(MEIO_DIA.getTime() - 10 * MINUTO).toISOString(),
        ate: null,
      }),
    );
    mocks.updateStatus.mockResolvedValue(operacaoCom(null));
    abrir();
    expect(await screen.findByText('até você retomar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retomar pedidos' }));

    await waitFor(() => expect(mocks.updateStatus).toHaveBeenCalledWith('token', { ajuste: null }));
    expect(await screen.findByText('Aberta')).toBeInTheDocument();
  });

  it('se o servidor recusa, diz por quê e não finge que mudou', async () => {
    mocks.operation.mockResolvedValue(operacaoCom(null));
    mocks.updateStatus.mockRejectedValue(
      new ApiError(400, { message: 'O fim do ajuste já passou.' }),
    );
    abrir();
    expect(await screen.findByText('Aberta')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    fireEvent.click(screen.getByRole('button', { name: '15 min' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O fim do ajuste já passou.');
    await waitFor(() => expect(screen.getByText('Aberta')).toBeInTheDocument());
  });
});
