import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PedidoDaLoja } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PagamentoPix } from '@/components/loja-online/pagamento-pix';
import { paletaDoTema } from '@/components/loja-online/paleta';

/**
 * O Pix do pedido em "Meus pedidos": o QR, o copia e cola e o "Já paguei", que
 * pergunta ao servidor — o navegador não decide que pagou.
 */

const mocks = vi.hoisted(() => ({
  conferirPagamento: vi.fn(),
  tokenDoCliente: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  publicStoreOrdersApi: { conferirPagamento: mocks.conferirPagamento },
}));
vi.mock('@/lib/firebase-da-loja', () => ({ tokenDoCliente: mocks.tokenDoCliente }));

const EXPIRA = new Date('2026-09-27T15:15:00-03:00');

function pedido(mudancas: Partial<PedidoDaLoja> = {}): PedidoDaLoja {
  return {
    id: 'pedido-1',
    numero: 7,
    criadoEm: '2026-09-27T18:00:00.000Z',
    modalidade: 'ENTREGA',
    etapa: 'AGUARDANDO_PAGAMENTO',
    historico: [{ etapa: 'AGUARDANDO_PAGAMENTO', em: '2026-09-27T18:00:00.000Z' }],
    janela: null,
    minutosDePreparo: 20,
    minutosDeEntrega: 15,
    cancelamento: null,
    entregaPor: 'MOTOBOYCITY',
    cliente: { nome: 'Ana', telefone: '33999887766' },
    itens: [],
    subtotal: 50,
    taxaDeEntrega: 5,
    total: 55,
    pagamento: 'PIX_ONLINE',
    trocoPara: null,
    entrega: null,
    observacao: null,
    corrida: null,
    avisoDaCorrida: null,
    pagamentoOnline: {
      situacao: 'AGUARDANDO',
      pixCopiaECola: '00020126580014br.gov.bcb.pix',
      qrCode: 'iVBORw0KGgo',
      expiraEm: EXPIRA.toISOString(),
      pagoEm: null,
      aviso: null,
    },
    ...mudancas,
  };
}

const PALETA = paletaDoTema('CLARO');

beforeEach(() => {
  mocks.tokenDoCliente.mockResolvedValue('token-do-cliente');
});

describe('Pix do pedido', () => {
  it('mostra o QR, o código para copiar e até quando vale', async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrever },
      configurable: true,
    });
    render(
      <PagamentoPix
        slug="acai"
        pedido={pedido()}
        paleta={PALETA}
        cor="#15803d"
        aoMudar={vi.fn()}
      />,
    );

    expect(screen.getByAltText('QR code do Pix')).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw0KGgo',
    );
    expect(screen.getByText(/Vale até as 15:15/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código do Pix' }));
    await waitFor(() => expect(escrever).toHaveBeenCalledWith('00020126580014br.gov.bcb.pix'));
    expect(await screen.findByRole('button', { name: 'Código copiado' })).toBeInTheDocument();
  });

  it('"Já paguei" confere no servidor e põe no lugar o pedido que voltou', async () => {
    const pago = pedido({
      etapa: 'NOVO',
      pagamentoOnline: {
        situacao: 'PAGO',
        pixCopiaECola: null,
        qrCode: null,
        expiraEm: null,
        pagoEm: '2026-09-27T18:03:00.000Z',
        aviso: null,
      },
    });
    mocks.conferirPagamento.mockResolvedValueOnce(pedido()).mockResolvedValueOnce(pago);
    const aoMudar = vi.fn();
    render(
      <PagamentoPix
        slug="acai"
        pedido={pedido()}
        paleta={PALETA}
        cor="#15803d"
        aoMudar={aoMudar}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Já paguei' }));
    expect(await screen.findByRole('status')).toHaveTextContent('ainda não foi confirmado');
    expect(mocks.conferirPagamento).toHaveBeenCalledWith('acai', 'token-do-cliente', 'pedido-1');

    fireEvent.click(screen.getByRole('button', { name: 'Já paguei' }));
    await waitFor(() => expect(aoMudar).toHaveBeenLastCalledWith(pago));
  });

  it('pago ou estornado, diz o que houve com o dinheiro', () => {
    const { rerender } = render(
      <PagamentoPix
        slug="acai"
        pedido={pedido({
          etapa: 'CANCELADO',
          pagamentoOnline: { ...pedido().pagamentoOnline!, situacao: 'ESTORNADO' },
        })}
        paleta={PALETA}
        cor="#15803d"
        aoMudar={vi.fn()}
      />,
    );
    expect(screen.getByText(/o valor do Pix voltou para você/)).toBeInTheDocument();
    rerender(
      <PagamentoPix
        slug="acai"
        pedido={pedido({
          etapa: 'ACEITO',
          pagamentoOnline: { ...pedido().pagamentoOnline!, situacao: 'PAGO' },
        })}
        paleta={PALETA}
        cor="#15803d"
        aoMudar={vi.fn()}
      />,
    );
    expect(screen.getByText('Pago pelo Pix.')).toBeInTheDocument();
  });
});
