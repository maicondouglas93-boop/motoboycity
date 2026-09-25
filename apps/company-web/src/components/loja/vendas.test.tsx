import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LojaVendasPage from '@/app/(app)/loja/vendas/page';
import {
  lerOperacao,
  lerVendas,
  proximoNumeroDeVenda,
  registrarVenda,
  salvarOperacao,
} from '@/lib/loja-demo';

/**
 * A tela de Vendas fica atrás do login do painel; este teste confere o pedido
 * da loja que entrega com motoboy próprio, e a impressão.
 */

function vendaDaLojaPronta(): number {
  const numero = proximoNumeroDeVenda();
  const exemplo = lerVendas().find((venda) => venda.modalidade === 'ENTREGA')!;
  registrarVenda({
    ...exemplo,
    numero,
    janela: null,
    entregaPor: 'LOJA',
    etapa: 'PRONTO',
    historico: [...exemplo.historico, { etapa: 'PRONTO', em: new Date().toISOString() }],
  });
  return numero;
}

function cartao(numero: number): HTMLElement {
  const elemento = screen.getByText(`#${numero}`).closest<HTMLElement>('[data-slot="card"]');
  if (!elemento) throw new Error(`Cartão do pedido ${numero} não encontrado`);
  return elemento;
}

describe('Vendas — entregador da loja', () => {
  it('a loja marca a saída; num aperto, passa o pedido para o MOTOboyCity', () => {
    salvarOperacao({ entrega: { ...lerOperacao().entrega, quemEntrega: 'LOJA' } });
    const numero = vendaDaLojaPronta();
    render(<LojaVendasPage />);

    const doPedido = within(cartao(numero));
    expect(doPedido.getByText('Entregador da loja')).toBeInTheDocument();
    expect(doPedido.getByRole('button', { name: 'Saiu para entrega' })).toBeInTheDocument();
    // Sem corrida, a loja ainda cancela o pronto.
    expect(doPedido.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();

    fireEvent.click(doPedido.getByRole('button', { name: 'Chamar motoboy do MOTOboyCity' }));
    expect(doPedido.getByText(/vira corrida no MOTOboyCity/)).toBeInTheDocument();
    fireEvent.click(doPedido.getByRole('button', { name: 'Chamar motoboy' }));

    expect(lerVendas().find((venda) => venda.numero === numero)?.entregaPor).toBe('MOTOBOYCITY');
    const depois = within(cartao(numero));
    expect(depois.getByText('Motoboy do MOTOboyCity')).toBeInTheDocument();
    expect(depois.getByRole('button', { name: 'Motoboy coletou' })).toBeInTheDocument();
    expect(depois.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('cada pedido tem o botão de imprimir, numa aba nova', () => {
    const numero = vendaDaLojaPronta();
    render(<LojaVendasPage />);

    const imprimir = within(cartao(numero)).getByRole('link', { name: 'Imprimir' });
    expect(imprimir).toHaveAttribute('href', `/loja/vendas/${numero}/imprimir`);
    expect(imprimir).toHaveAttribute('target', '_blank');
  });
});
