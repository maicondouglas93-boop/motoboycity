import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PedidoDaLoja, PixDiretoDoPedido } from '@motoboycity/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paletaDoTema } from '@/components/loja-online/paleta';
import { PixDiretoDoPedido as PainelDoPix, linkDoComprovante } from './pix-direto-do-pedido';

/**
 * O Pix direto do pedido, em "Meus pedidos": o QR, o botão de copiar o código
 * (é o caminho de quem pede pelo celular, onde não dá para escanear a própria
 * tela) e o aviso para enviar o comprovante pelo WhatsApp da loja.
 */

const CODIGO =
  '00020126360014br.gov.bcb.pix0114+5533999887766520400005303986540548.205802BR5913LANCHES DO ZE6007LAJINHA62120508PEDIDO426304D4D7';
const paleta = paletaDoTema('CLARO');

function pedido(
  pix: Partial<PixDiretoDoPedido> | null,
  mudancas: Partial<PedidoDaLoja> = {},
): PedidoDaLoja {
  return {
    id: 'pedido-1',
    numero: 42,
    etapa: 'ACEITO',
    total: 48.2,
    cliente: { nome: 'Ana Lima', telefone: '33999887766' },
    pixDireto:
      pix === null
        ? null
        : {
            situacao: 'AGUARDANDO',
            copiaECola: CODIGO,
            whatsapp: '5533988776655',
            confirmadoEm: null,
            ...pix,
          },
    ...mudancas,
  } as PedidoDaLoja;
}

const abrir = (dados: PedidoDaLoja) =>
  render(<PainelDoPix pedido={dados} paleta={paleta} cor="#15803d" />);

let escrever: ReturnType<typeof vi.fn>;

beforeEach(() => {
  escrever = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: escrever },
    configurable: true,
  });
});

describe('Pix direto do pedido', () => {
  it('mostra o valor, o QR e o código para colar no banco', () => {
    abrir(pedido({}));

    expect(screen.getByText(/Pague o Pix de R\$\s*48,20/)).toBeInTheDocument();
    expect(screen.getByTitle('QR code do Pix')).toBeInTheDocument();
    expect(screen.getByText(CODIGO)).toBeInTheDocument();
    expect(screen.getByText(/copie o código e cole no app do seu banco/)).toBeInTheDocument();
  });

  it('o botão copia o código inteiro, e avisa que copiou', async () => {
    abrir(pedido({}));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar código do Pix' }));

    await waitFor(() => expect(escrever).toHaveBeenCalledWith(CODIGO));
    expect(await screen.findByRole('button', { name: 'Código copiado' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Agora é só colar no app do seu banco.');
  });

  it('sem permissão para copiar, nada quebra: o código continua na tela', async () => {
    escrever.mockRejectedValue(new Error('negado'));
    abrir(pedido({}));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar código do Pix' }));

    await waitFor(() => expect(escrever).toHaveBeenCalled());
    expect(screen.getByText(CODIGO)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Código copiado' })).not.toBeInTheDocument();
  });

  it('o aviso do comprovante vem em destaque, com o link do WhatsApp da loja', () => {
    abrir(pedido({}));

    expect(screen.getByText('Depois de pagar, envie o comprovante')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Enviar comprovante pelo WhatsApp' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    const endereco = new URL(link.getAttribute('href')!);
    expect(endereco.origin + endereco.pathname).toBe('https://wa.me/5533988776655');
    // A loja lê o pedido, o valor e quem é o cliente sem precisar perguntar.
    const mensagem = endereco.searchParams.get('text')!;
    expect(mensagem).toContain('pedido #42');
    expect(mensagem).toMatch(/R\$\s*48,20/);
    expect(mensagem).toContain('Ana Lima');
  });

  it('sem o WhatsApp da loja, ainda diz para onde mandar o comprovante', () => {
    abrir(pedido({ whatsapp: null }));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Envie o comprovante para o WhatsApp da loja.')).toBeInTheDocument();
  });

  it('confirmado pela loja: só diz que confirmou, sem o código para pagar de novo', () => {
    abrir(
      pedido({ situacao: 'CONFIRMADO', copiaECola: null, confirmadoEm: '2026-09-29T15:00:00Z' }),
    );

    expect(screen.getByText('Pix confirmado pela loja.')).toBeInTheDocument();
    expect(screen.queryByTitle('QR code do Pix')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar/ })).not.toBeInTheDocument();
  });

  it('pedido cancelado: sem Pix a pagar; se já estava confirmado, a loja devolve', () => {
    const { unmount } = abrir(pedido({ copiaECola: null }, { etapa: 'CANCELADO' }));
    expect(screen.queryByTitle('QR code do Pix')).not.toBeInTheDocument();
    expect(screen.queryByText(/devolver/)).not.toBeInTheDocument();
    unmount();

    abrir(pedido({ situacao: 'CONFIRMADO', copiaECola: null }, { etapa: 'CANCELADO' }));
    expect(screen.getByText(/a loja vai devolver o valor para você/)).toBeInTheDocument();
  });

  it('pedido que não é Pix direto não mostra nada', () => {
    const { container } = abrir(pedido(null));

    expect(container).toBeEmptyDOMElement();
  });

  it('o link do comprovante escapa o texto: o nome do cliente não quebra a mensagem', () => {
    const link = linkDoComprovante(
      pedido({}, { cliente: { nome: 'Zé & Ana #1', telefone: '33999887766' } }),
      '5533988776655',
    );

    expect(new URL(link).searchParams.get('text')).toContain('Nome: Zé & Ana #1.');
  });
});
