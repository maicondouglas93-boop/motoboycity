import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { printDelivery } from '@/test/delivery-print-fixture';
import { DeliveryReceipt } from './delivery-receipt';

const printedAt = '2026-09-11T01:30:00.000Z';

describe('DeliveryReceipt', () => {
  it('usa o snapshot do pedido, data de Brasília e não imprime valores, pagamento ou IDs internos', () => {
    const { container } = render(<DeliveryReceipt delivery={printDelivery} printedAt={printedAt} />);
    expect(screen.getByRole('heading', { name: 'PEDIDO #1234' })).toBeInTheDocument();
    for (const text of ['Loja de teste Lajinha', 'Cliente de exemplo', '(33) 90000-0000',
      'Rua de exemplo', '20', 'Casa dos fundos', 'Lajinha / MG', '36980-000', 'Em frente à praça',
      'LOJA-42', 'Aguardando motoboy']) expect(screen.getByText(text)).toBeInTheDocument();
    expect(container.textContent).toContain('10/09/2026, 22:30');
    expect(container.textContent).not.toMatch(/R\$|Troco|Pagamento|Subtotal|Taxa de teste|print-company|11111111/);
    expect(screen.getAllByLabelText('Preencher à mão')).toHaveLength(2); // bairro + conferente
  });

  it('deixa linhas para destino ausente sem confundir endereço da coleta com o destinatário', () => {
    render(<DeliveryReceipt delivery={{ ...printDelivery, recipientName: null, recipientPhone: null,
      destinationKnownAtCreation: false, addresses: [{ ...printDelivery.addresses[0]!, type: 'PICKUP', street: 'Rua da loja' }],
    }} printedAt={printedAt} />);
    expect(screen.getAllByLabelText('Preencher à mão')).toHaveLength(9);
    expect(screen.queryByText('Rua da loja')).not.toBeInTheDocument();
    expect(screen.getByText(/Destino definido na entrega/)).toBeInTheDocument();
  });

  it('preserva os campos preenchidos e deixa linha somente no que falta', () => {
    render(<DeliveryReceipt delivery={{ ...printDelivery,
      addresses: [{ ...printDelivery.addresses[0]!, number: null, complement: null, referenceNote: null }],
    }} printedAt={printedAt} />);
    expect(screen.getByText('Rua de exemplo')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Preencher à mão')).toHaveLength(5);
  });

  it('imprime responsável atual e não reutiliza atribuição residual após cancelamento ou redispatch', () => {
    const assigned = { ...printDelivery, status: 'ACCEPTED' as const,
      driver: { id: 'driver-current', name: 'Motoboy atual', phone: 'privado', avatarUrl: null } };
    const { rerender } = render(<DeliveryReceipt delivery={assigned} printedAt={printedAt} />);
    expect(screen.getByText('Motoboy atual')).toBeInTheDocument();
    expect(screen.queryByText('privado')).not.toBeInTheDocument();
    rerender(<DeliveryReceipt delivery={{ ...assigned, status: 'AWAITING_DRIVER' }} printedAt={printedAt} />);
    expect(screen.getByText('Aguardando motoboy')).toBeInTheDocument();
    expect(screen.queryByText('Motoboy atual')).not.toBeInTheDocument();
    rerender(<DeliveryReceipt delivery={{ ...assigned, status: 'CANCELLED' }} printedAt={printedAt} />);
    expect(screen.getByText('Sem motoboy atribuído')).toBeInTheDocument();
    expect(screen.queryByText('Motoboy atual')).not.toBeInTheDocument();
  });

  it('mantém observações longas completas e escapa HTML', () => {
    const note = '<script>alert(1)</script>\n' + 'Instrução longa sem perder conteúdo. '.repeat(50);
    const { container } = render(<DeliveryReceipt delivery={{ ...printDelivery, driverNote: note,
      requiresReturn: true, scheduledAt: printedAt }} printedAt={printedAt} />);
    expect(container.textContent).toContain(note);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('COM RETORNO À LOJA')).toBeInTheDocument();
    expect(screen.getByText('AGENDADO PARA:')).toBeInTheDocument();
  });
});
