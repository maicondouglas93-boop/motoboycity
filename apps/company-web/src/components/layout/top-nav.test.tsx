import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from './top-nav';

const navigation = vi.hoisted(() => ({ pathname: '/pedidos', push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));
vi.mock('@/components/operations/call-driver-dialog', () => ({
  CallDriverDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/notification-bell', () => ({ NotificationBell: () => null }));

function renderNav() {
  return render(<QueryClientProvider client={new QueryClient()}><TopNav /></QueryClientProvider>);
}

describe('TopNav — marca aiqfome', () => {
  beforeEach(() => { navigation.pathname = '/pedidos'; });

  it('substitui texto por imagem local mantendo destino e nome acessível', () => {
    renderNav();
    const link = screen.getByRole('link', { name: 'aiqfome — Integrações' });
    expect(link).toHaveAttribute('href', '/integracoes');
    expect(link).not.toHaveAttribute('aria-current');
    expect(within(link).getByRole('img', { name: 'aiqfome' })).toHaveAttribute('src', expect.stringContaining('aiqfome.jpeg'));
    expect(within(link).queryByText('Integrações')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Chamar.*entregador/ })).toBeInTheDocument();
  });

  it.each(['/integracoes', '/integracoes/aiqfome'])('mantém destaque ativo em %s', (pathname) => {
    navigation.pathname = pathname;
    renderNav();
    expect(screen.getByRole('link', { name: 'aiqfome — Integrações' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Financeiro' })).toHaveAttribute('href', '/financeiro');
  });
});
