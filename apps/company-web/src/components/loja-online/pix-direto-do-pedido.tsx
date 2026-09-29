'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PedidoDaLoja } from '@motoboycity/types';
import { moeda, textoSobre, type Paleta } from '@/components/loja-online/paleta';

/**
 * O link do WhatsApp da loja, com o comprovante já apresentado: o número do
 * pedido, o valor e quem é o cliente. A loja confere o comprovante contra o
 * extrato e confirma o pagamento em Vendas — quem lê essa mensagem precisa
 * saber de qual pedido se trata sem perguntar.
 */
export function linkDoComprovante(pedido: PedidoDaLoja, whatsapp: string): string {
  const mensagem =
    `Olá! Segue o comprovante do Pix do pedido #${pedido.numero}, ` +
    `no valor de ${moeda(pedido.total)}. Nome: ${pedido.cliente.nome}.`;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * O Pix direto do pedido, em "Meus pedidos": o QR e o copia e cola com o valor,
 * e o aviso para enviar o comprovante pelo WhatsApp da loja.
 *
 * Sem gateway, nada confirma o pagamento sozinho — a tela não diz "pago" nem
 * espera mudar: quem confirma é a loja, depois de ver o comprovante. Por isso o
 * aviso vem em destaque, e não como uma dica no rodapé: quem paga e não envia o
 * comprovante espera um pedido que a loja ainda não sabe se foi pago.
 */
export function PixDiretoDoPedido({
  pedido,
  paleta,
  cor,
}: {
  pedido: PedidoDaLoja;
  paleta: Paleta;
  /** A cor de ação da loja, no botão principal. */
  cor: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const pix = pedido.pixDireto;
  if (!pix) return null;

  if (pedido.etapa === 'CANCELADO') {
    return pix.situacao === 'CONFIRMADO' ? (
      <p className="mt-2 text-xs" style={{ color: paleta.suave }}>
        O pedido foi cancelado. Como o Pix já estava confirmado, a loja vai devolver o valor para
        você.
      </p>
    ) : null;
  }

  if (pix.situacao === 'CONFIRMADO') {
    return (
      <p className="mt-2 text-xs" style={{ color: paleta.suave }}>
        Pix confirmado pela loja.
      </p>
    );
  }

  const codigo = pix.copiaECola;
  if (!codigo) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo as string);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 3_000);
    } catch {
      // Sem permissão de área de transferência: o código continua na tela.
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border p-3" style={{ borderColor: paleta.linha }}>
      <p className="text-sm font-medium">Pague o Pix de {moeda(pedido.total)} para a loja.</p>

      <div className="mx-auto w-fit rounded-lg bg-white p-2">
        <QRCodeSVG value={codigo} size={176} title="QR code do Pix" />
      </div>

      {/* No celular ninguém escaneia o QR da própria tela: copiar o código e
          colar no app do banco é o caminho de quem está pedindo pelo aparelho. */}
      <div className="space-y-2">
        <p className="text-xs" style={{ color: paleta.suave }}>
          No celular, copie o código e cole no app do seu banco, em Pix → Copia e cola:
        </p>
        <p
          className="break-all rounded-lg border px-2 py-1.5 font-mono text-[11px] leading-snug"
          style={{ borderColor: paleta.linha }}
        >
          {codigo}
        </p>
        <button
          type="button"
          onClick={copiar}
          className="w-full rounded-lg px-3 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: cor, color: textoSobre(cor) }}
        >
          {copiado ? 'Código copiado' : 'Copiar código do Pix'}
        </button>
        <p role="status" className="min-h-4 text-xs" style={{ color: paleta.suave }}>
          {copiado ? 'Agora é só colar no app do seu banco.' : ''}
        </p>
      </div>

      {/* O passo que falta, em destaque: pagar não basta. */}
      <div
        className="space-y-2 rounded-lg border p-3"
        style={{ borderColor: paleta.texto, backgroundColor: paleta.superficie }}
      >
        <p className="text-sm font-semibold">Depois de pagar, envie o comprovante</p>
        <p className="text-xs" style={{ color: paleta.suave }}>
          A loja só confirma o pagamento depois de ver o comprovante, pelo WhatsApp.
        </p>
        {pix.whatsapp ? (
          <a
            href={linkDoComprovante(pedido, pix.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg px-3 py-2.5 text-center text-sm font-semibold"
            style={{ backgroundColor: cor, color: textoSobre(cor) }}
          >
            Enviar comprovante pelo WhatsApp
          </a>
        ) : (
          <p className="text-xs font-medium">Envie o comprovante para o WhatsApp da loja.</p>
        )}
      </div>
    </div>
  );
}
