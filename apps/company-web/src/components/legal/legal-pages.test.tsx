import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyPolicyPage from '@/app/politica-de-privacidade/page';
import TermsOfUsePage from '@/app/termos-de-uso/page';

describe('páginas legais públicas', () => {
  it('explica os termos da operação e da integração aiqfome', () => {
    render(<TermsOfUsePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Integração com o aiqfome' })).toBeVisible();
    expect(screen.getByText(/não autoriza a MOTOboyCity a alterar cardápio/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/politica-de-privacidade',
    );
  });

  it('informa localização, retenção e direitos do titular', () => {
    render(<PrivacyPolicyPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Localização do entregador' })).toBeVisible();
    expect(screen.getByText(/mantidos por até/i)).toHaveTextContent('30 dias');
    expect(screen.getByRole('heading', { name: 'Direitos dos titulares' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'maicondouglas93@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:maicondouglas93@gmail.com',
    );
  });
});
