import type { CompanyCustomerRankingItem } from '@motoboycity/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerRanking } from './customer-ranking';

const items: CompanyCustomerRankingItem[] = [
  {
    id: 'customer-1',
    name: 'Maria Oliveira',
    phone: '33999999991',
    totalDeliveries: 20,
    completedDeliveries: 18,
    inProgressDeliveries: 1,
    cancelledDeliveries: 1,
    lastDeliveryAt: '2026-08-30T12:00:00.000Z',
  },
  {
    id: 'customer-2',
    name: 'Joao Silva',
    phone: '33999999992',
    totalDeliveries: 16,
    completedDeliveries: 15,
    inProgressDeliveries: 1,
    cancelledDeliveries: 0,
    lastDeliveryAt: '2026-08-29T12:00:00.000Z',
  },
  {
    id: 'customer-3',
    name: 'Ana Costa',
    phone: '33999999993',
    totalDeliveries: 13,
    completedDeliveries: 12,
    inProgressDeliveries: 0,
    cancelledDeliveries: 1,
    lastDeliveryAt: '2026-08-28T12:00:00.000Z',
  },
  {
    id: 'customer-4',
    name: 'Carlos Souza',
    phone: '33999999994',
    totalDeliveries: 10,
    completedDeliveries: 9,
    inProgressDeliveries: 0,
    cancelledDeliveries: 1,
    lastDeliveryAt: '2026-08-27T12:00:00.000Z',
  },
];

describe('CustomerRanking', () => {
  it('mostra o podio e a continuacao do ranking com links para os clientes', () => {
    render(<CustomerRanking items={items} isLoading={false} isError={false} onRetry={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Melhores clientes' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '1º lugar: Maria Oliveira, 18 entregas concluídas' }),
    ).toHaveAttribute('href', '/clientes/customer-1');
    expect(screen.getByRole('link', { name: '2º lugar: Joao Silva, 15 entregas concluídas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3º lugar: Ana Costa, 12 entregas concluídas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '4º lugar: Carlos Souza' })).toHaveAttribute(
      'href',
      '/clientes/customer-4',
    );
    expect(screen.getByText('90% de conclusão')).toBeInTheDocument();
  });

  it('explica quando ainda nao ha clientes com entregas', () => {
    render(<CustomerRanking items={[]} isLoading={false} isError={false} onRetry={vi.fn()} />);

    expect(screen.getByText('O pódio começa na primeira entrega')).toBeInTheDocument();
  });

  it('permite tentar novamente quando a consulta falha', () => {
    const onRetry = vi.fn();
    render(<CustomerRanking items={[]} isLoading={false} isError onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
