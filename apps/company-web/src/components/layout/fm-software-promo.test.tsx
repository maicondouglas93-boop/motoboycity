import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FmSoftwarePromo } from './fm-software-promo';

describe('FmSoftwarePromo', () => {
  it('divulga a autoria e abre o contato correto no WhatsApp', () => {
    render(<FmSoftwarePromo />);

    expect(
      screen.getByText('Sistema desenvolvido por Franklim Melo — FM Software'),
    ).toBeInTheDocument();
    expect(screen.getByText('(19) 99705-0303')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /FM Software pelo WhatsApp/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('https://wa.me/5519997050303'));
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain(
      'gostaria de conhecer os serviços da FM Software',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
