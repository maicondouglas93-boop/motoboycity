'use client';

import { useState } from 'react';
import type { PedidoDaLoja, SituacaoDoPagamento } from '@motoboycity/types';
import type { Paleta } from '@/components/loja-online/paleta';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { tokenDoCliente } from '@/lib/firebase-da-loja';
import { hora } from '@/lib/loja-horario';

/** O que o cliente lê do pagamento depois que o Pix deixou de esperar. */
const DEPOIS_DO_PIX: Partial<Record<SituacaoDoPagamento, string>> = {
  PAGO: 'Pago pelo Pix.',
  ESTORNANDO: 'O pedido foi cancelado, e o valor do Pix está voltando para você.',
  ESTORNO_FALHOU: 'O pedido foi cancelado, e o valor do Pix vai voltar para você.',
  ESTORNADO: 'O pedido foi cancelado, e o valor do Pix voltou para você.',
};

/**
 * O Pix do pedido pago online, em "Meus pedidos". Esperando: o QR code, o
 * copia e cola e até quando vale — a loja só recebe o pedido depois de pago. O
 * "Já paguei" pede ao servidor para conferir no Asaas agora; o navegador não
 * decide que pagou.
 */
export function PagamentoPix({
  slug,
  pedido,
  paleta,
  cor,
  aoMudar,
}: {
  slug: string;
  pedido: PedidoDaLoja;
  paleta: Paleta;
  cor: string;
  aoMudar: (pedido: PedidoDaLoja) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [ainda, setAinda] = useState(false);
  const pagamento = pedido.pagamentoOnline;
  if (!pagamento) return null;

  if (pedido.etapa !== 'AGUARDANDO_PAGAMENTO' || pagamento.situacao !== 'AGUARDANDO') {
    const texto = DEPOIS_DO_PIX[pagamento.situacao];
    return texto ? (
      <p className="mt-2 text-xs" style={{ color: paleta.suave }}>
        {texto}
      </p>
    ) : null;
  }

  async function copiar() {
    if (!pagamento?.pixCopiaECola) return;
    try {
      await navigator.clipboard.writeText(pagamento.pixCopiaECola);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 3_000);
    } catch {
      // Sem permissão de área de transferência: o código continua na tela.
    }
  }

  async function conferir() {
    setConferindo(true);
    setAinda(false);
    try {
      const token = await tokenDoCliente();
      if (!token) return;
      const atual = await publicStoreOrdersApi.conferirPagamento(slug, token, pedido.id);
      aoMudar(atual);
      if (atual.etapa === 'AGUARDANDO_PAGAMENTO') setAinda(true);
    } catch {
      setAinda(true);
    } finally {
      setConferindo(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border p-3" style={{ borderColor: paleta.linha }}>
      <p className="text-sm font-medium">Pague o Pix para a loja receber o seu pedido.</p>
      {pagamento.qrCode && (
        // eslint-disable-next-line @next/next/no-img-element -- imagem gerada pelo Asaas, em base64
        <img
          src={`data:image/png;base64,${pagamento.qrCode}`}
          alt="QR code do Pix"
          width={192}
          height={192}
          className="mx-auto size-48 rounded-lg bg-white p-2"
        />
      )}
      {pagamento.pixCopiaECola && (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: paleta.suave }}>
            Ou copie o código e cole no app do seu banco, em Pix → Copia e cola:
          </p>
          <p
            className="break-all rounded-lg border px-2 py-1.5 font-mono text-[11px] leading-snug"
            style={{ borderColor: paleta.linha }}
          >
            {pagamento.pixCopiaECola}
          </p>
          <button
            type="button"
            onClick={copiar}
            className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: cor }}
          >
            {copiado ? 'Código copiado' : 'Copiar código do Pix'}
          </button>
        </div>
      )}
      {pagamento.expiraEm && (
        <p className="text-xs" style={{ color: paleta.suave }}>
          Vale até as {hora(new Date(pagamento.expiraEm))}. Depois disso, o pedido é cancelado.
        </p>
      )}
      <button
        type="button"
        onClick={conferir}
        disabled={conferindo}
        className="w-full rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: paleta.linha }}
      >
        {conferindo ? 'Conferindo...' : 'Já paguei'}
      </button>
      {ainda && (
        <p role="status" className="text-xs" style={{ color: paleta.suave }}>
          O pagamento ainda não foi confirmado. Pode levar alguns segundos — esta tela muda sozinha.
        </p>
      )}
    </div>
  );
}
