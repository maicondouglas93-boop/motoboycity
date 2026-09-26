import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LojaNaoAbriu from '@/app/(loja)/pedir/[slug]/error';

/**
 * A loja que não abriu — a API fora do ar ou lenta — tem saída: "Tentar de
 * novo" pede a página ao servidor outra vez, e não só refaz a tela.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('Loja que não abriu', () => {
  it('diz o que houve e tenta de novo pelo servidor', () => {
    const reset = vi.fn();
    render(<LojaNaoAbriu error={new Error('fetch failed')} reset={reset} />);

    expect(screen.getByRole('heading', { name: 'A loja não abriu agora' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });
});
