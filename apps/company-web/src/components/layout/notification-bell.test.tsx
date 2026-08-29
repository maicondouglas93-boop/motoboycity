import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationsResult } from '@motoboycity/types';
import { NotificationBell } from './notification-bell';

function renderizar(resultado: NotificationsResult | Error, token: string | null = 'jwt') {
  const buscar = vi.fn(() =>
    resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell token={token} fetchNotifications={buscar} />
    </QueryClientProvider>,
  );
  return buscar;
}

const avisoCritico = {
  id: 'company:invoices:overdue',
  severity: 'critical' as const,
  title: '2 faturas vencidas',
  description: 'R$ 480,50 em atraso.',
  href: '/faturas',
  actionLabel: 'Ver faturas',
};

const avisoComum = {
  id: 'company:deliveries:awaiting-driver',
  severity: 'warning' as const,
  title: '1 pedido sem entregador',
  description: 'Esperando ha mais de 15 minutos.',
  href: '/pedidos',
  actionLabel: 'Ver pedidos',
};

describe('NotificationBell', () => {
  it('nao mostra contador quando nao ha nada pendente', async () => {
    renderizar({ items: [], criticalCount: 0 });

    const sino = await screen.findByRole('button', { name: /nada pendente/i });
    expect(sino.textContent).toBe('');
  });

  it('conta o total e nomeia os criticos para quem usa leitor de tela', async () => {
    renderizar({ items: [avisoCritico, avisoComum], criticalCount: 1 });

    const sino = await screen.findByRole('button', { name: /2 pendente\(s\).*1 crítico/i });
    expect(sino).toHaveTextContent('2');
  });

  /**
   * O numero e o total; a cor e que separa critico de aviso. Mostrar so os
   * criticos esconderia o resto, e mostrar dois numeros viraria painel.
   */
  it('mostra o total mesmo quando nenhum e critico', async () => {
    renderizar({ items: [avisoComum], criticalCount: 0 });

    expect(await screen.findByRole('button', { name: /1 pendente/i })).toHaveTextContent('1');
  });

  it('abre a lista com o caminho que resolve cada aviso', async () => {
    renderizar({ items: [avisoCritico, avisoComum], criticalCount: 1 });
    fireEvent.click(await screen.findByRole('button', { name: /pendente/i }));

    expect(await screen.findByText('2 faturas vencidas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver faturas' })).toHaveAttribute('href', '/faturas');
    expect(screen.getByRole('link', { name: 'Ver pedidos' })).toHaveAttribute('href', '/pedidos');
  });

  it('nao consulta nada sem sessao', () => {
    const buscar = renderizar({ items: [], criticalCount: 0 }, null);

    expect(buscar).not.toHaveBeenCalled();
  });

  /**
   * O sino e acessorio: se a consulta falhar, ele fica quieto em vez de
   * transformar um erro secundario em alarme na barra superior.
   */
  it('falha em silencio quando a consulta nao responde', async () => {
    renderizar(new Error('500'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /nada pendente/i })).toBeInTheDocument(),
    );
  });
});
