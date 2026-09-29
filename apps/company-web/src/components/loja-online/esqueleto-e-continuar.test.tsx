import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsqueletoDoCheckout } from './esqueleto-do-checkout';
import { FolhaDaSacola } from './folha-da-sacola';
import { paletaDoTema } from './paleta';

/**
 * O toque em "Continuar" tem resposta antes de a próxima tela chegar: o botão
 * diz que está abrindo, e o checkout aparece como esqueleto, não como vazio.
 */

const estado = vi.hoisted(() => ({ pending: false }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: estado.pending }),
}));

beforeAll(() => {
  window.matchMedia ??= ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
});

beforeEach(() => {
  estado.pending = false;
});

const paleta = paletaDoTema('CLARO');

function abrirASacola() {
  render(
    <FolhaDaSacola
      itens={[
        {
          produtoId: 'p1',
          nome: 'X-Burger',
          tamanho: null,
          escolhas: [],
          observacao: '',
          unitario: 20,
          quantidade: 1,
        } as never,
      ]}
      total={20}
      slug="lanches-do-ze"
      paleta={paleta}
      corDeAcao="#f5a623"
      onAjustar={() => {}}
      onFechar={() => {}}
    />,
  );
}

describe('Continuar', () => {
  it('parado, o botão diz Continuar e leva ao checkout', () => {
    abrirASacola();

    const link = screen.getByRole('link', { name: 'Continuar' });
    expect(link).toHaveAttribute('href', '/pedir/lanches-do-ze/sacola');
  });

  it('no toque, o botão diz que está abrindo', () => {
    estado.pending = true;
    abrirASacola();

    const link = screen.getByRole('link', { name: /Abrindo/ });
    expect(link).toHaveAttribute('href', '/pedir/lanches-do-ze/sacola');
    expect(screen.queryByText('Continuar')).not.toBeInTheDocument();
  });
});

describe('esqueleto do checkout', () => {
  it('avisa quem usa leitor de tela e mostra o cabeçalho de verdade', () => {
    render(<EsqueletoDoCheckout paleta={paleta} corDaMarca="#f5a623" />);

    expect(screen.getByRole('status')).toHaveTextContent('Abrindo a sacola');
    expect(screen.getByText('Finalizar pedido')).toBeInTheDocument();
  });
});
