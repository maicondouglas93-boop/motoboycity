import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryOperationsResult } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printDelivery, printUser } from '@/test/delivery-print-fixture';
import { authUserQueryKey } from '@/lib/auth-user-query';
import { session } from '@/lib/session';
import { DeliveryPrintView } from './delivery-print-view';
import { DeliveryPrintLink } from './delivery-print-link';

const mocks = vi.hoisted(() => ({ operations: vi.fn(), profile: vi.fn(), me: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  deliveriesApi: { operations: mocks.operations },
  companyProfileApi: { get: mocks.profile }, authApi: { me: mocks.me },
}));

const result: DeliveryOperationsResult = { active: [printDelivery], recent: [], counts: {} };
const assigned: DeliveryOperationsResult = { ...result, active: [{ ...printDelivery, status: 'ACCEPTED',
  driver: { id: 'driver-current', name: 'Novo motoboy', phone: '', avatarUrl: null } }] };

function setup({ user = printUser, link = false, companyId = printDelivery.companyId } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(authUserQueryKey, user);
  return render(<QueryClientProvider client={client}>
    {link ? <DeliveryPrintLink deliveryId={printDelivery.id} companyId={companyId} />
      : <DeliveryPrintView deliveryId={printDelivery.id} />}
  </QueryClientProvider>);
}

beforeEach(() => {
  session.setToken('test-session');
  mocks.profile.mockReset().mockResolvedValue({ companyId: printDelivery.companyId });
  mocks.operations.mockReset().mockResolvedValue(result);
  mocks.me.mockReset().mockResolvedValue(printUser);
  vi.spyOn(window, 'print').mockImplementation(() => undefined);
});

describe('DeliveryPrintView', () => {
  it('carrega só o pedido exato, bloqueia impressão durante busca e não abre diálogo automaticamente', async () => {
    let resolve!: (value: DeliveryOperationsResult) => void;
    mocks.operations.mockReturnValueOnce(new Promise<DeliveryOperationsResult>((r) => { resolve = r; }));
    setup();
    expect(screen.getByRole('button', { name: 'Imprimir pedido' })).toBeDisabled();
    await waitFor(() => expect(mocks.operations).toHaveBeenCalledWith('test-session', { deliveryId: printDelivery.id }));
    await act(async () => resolve(result));
    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });

  it('atualiza motoboy em cada impressão e ignora cliques duplicados', async () => {
    setup();
    await screen.findByRole('article');
    mocks.operations.mockResolvedValue(assigned);
    vi.mocked(window.print).mockImplementationOnce(() => {
      // O DOM já deve estar atualizado no instante em que o navegador captura o cupom.
      expect(screen.getByRole('article')).toHaveTextContent('Novo motoboy');
      expect(screen.getByRole('article')).toHaveTextContent('A caminho da coleta');
      expect(screen.queryByText('Aguardando motoboy')).not.toBeInTheDocument();
    });
    const button = screen.getByRole('button', { name: 'Imprimir pedido' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(mocks.operations).toHaveBeenCalledTimes(2);
    expect(mocks.profile).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Novo motoboy')).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
    mocks.operations.mockResolvedValue(result);
    fireEvent.click(button);
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Aguardando motoboy')).toBeInTheDocument();
    expect(screen.queryByText('Novo motoboy')).not.toBeInTheDocument();
  });

  it('não imprime cache antigo quando a nova consulta falha; permite recuperar', async () => {
    setup();
    await screen.findByRole('article');
    mocks.operations.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('nega dados de outra empresa mesmo se uma resposta incorreta vier da API', async () => {
    mocks.operations.mockResolvedValue({ ...result, active: [{ ...printDelivery, companyId: 'other-company' }] });
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('não tem permissão');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it.each([401, 403, 404])('trata HTTP %s sem imprimir dados', async (status) => {
    mocks.operations.mockRejectedValue(new ApiError(status, { message: 'Falha' }));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });

  it('mostra não encontrado quando o filtro não retorna o pedido', async () => {
    mocks.operations.mockResolvedValue({ active: [], recent: [], counts: {} });
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido não encontrado');
  });

  it('também imprime pedidos concluídos antigos da lista recent', async () => {
    mocks.operations.mockResolvedValue({ active: [], recent: [{ ...printDelivery, status: 'COMPLETED' }], counts: {} });
    setup();
    expect(await screen.findByRole('article')).toHaveTextContent('Concluído');
  });

  it.each(['ADMIN', 'DRIVER'] as const)('não permite perfil %s', async (type) => {
    setup({ user: { ...printUser, type } });
    expect(await screen.findByRole('alert')).toHaveTextContent('apenas para a loja responsável');
    expect(mocks.operations).not.toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it('não imprime se a sessão mudar durante a preparação', async () => {
    setup();
    await screen.findByRole('article');
    mocks.operations.mockImplementationOnce(async () => { session.clearToken(); return assigned; });
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir pedido' }));
    await waitFor(() => expect(mocks.operations).toHaveBeenCalledTimes(2));
    expect(window.print).not.toHaveBeenCalled();
  });
});

describe('DeliveryPrintLink', () => {
  it('mostra ação somente quando o perfil da loja corresponde ao pedido', async () => {
    setup({ link: true });
    expect(await screen.findByRole('link', { name: 'Imprimir pedido' })).toHaveAttribute('href', `/pedidos/${printDelivery.id}/imprimir`);
  });

  it('esconde ação para outra empresa', async () => {
    setup({ link: true, companyId: 'other-company' });
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('esconde ação para administradores', () => {
    setup({ link: true, user: { ...printUser, type: 'ADMIN' } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
