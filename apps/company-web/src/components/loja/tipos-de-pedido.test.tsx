import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TiposDePedidoPage from '@/app/(app)/loja/tipos-de-pedido/page';
import { lerOperacao } from '@/lib/loja-demo';

/**
 * A tela de Tipos de pedido fica atrás do login do painel e não abre sem a
 * API; este teste é o que confere que a opção do prazo chega ao que é salvo.
 */

function caixaDe(texto: RegExp): HTMLElement {
  const caixa = screen
    .getByText(texto)
    .closest('label')
    ?.querySelector<HTMLElement>('[role=checkbox]');
  if (!caixa) throw new Error(`Caixa não encontrada: ${texto}`);
  return caixa;
}

function ligarAceiteManual() {
  fireEvent.click(screen.getByLabelText(/Aprovar manualmente/));
}

describe('Tipos de pedido — prazo do aceite', () => {
  it('só aparece no aceite manual, e já vem ligado', () => {
    render(<TiposDePedidoPage />);
    expect(screen.queryByText(/Cancelar sozinho/)).not.toBeInTheDocument();

    ligarAceiteManual();
    expect(caixaDe(/Cancelar sozinho/)).toHaveAttribute('aria-checked', 'true');
  });

  it('o prazo escolhido é o que fica salvo', () => {
    render(<TiposDePedidoPage />);
    ligarAceiteManual();
    fireEvent.change(screen.getByLabelText('Quanto tempo esperar o aceite'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tipos de pedido' }));

    expect(lerOperacao().recebimento).toMatchObject({ modo: 'MANUAL', prazoDoAceiteMin: 20 });
  });

  it('desligado, salva que o pedido não cai sozinho', () => {
    render(<TiposDePedidoPage />);
    ligarAceiteManual();
    fireEvent.click(caixaDe(/Cancelar sozinho/));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tipos de pedido' }));

    expect(lerOperacao().recebimento).toMatchObject({ modo: 'MANUAL', prazoDoAceiteMin: null });
  });
});

describe('Tipos de pedido — quem faz a entrega', () => {
  it('vem pelo MOTOboyCity, e a loja com motoboy próprio escolhe o entregador dela', () => {
    render(<TiposDePedidoPage />);
    expect(screen.getByLabelText(/Motoboy do MOTOboyCity/)).toBeChecked();

    fireEvent.click(screen.getByLabelText(/Entregador da loja/));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tipos de pedido' }));

    expect(lerOperacao().entrega.quemEntrega).toBe('LOJA');
  });
});
