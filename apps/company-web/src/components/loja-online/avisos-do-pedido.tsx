'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import type { Paleta } from '@/components/loja-online/paleta';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { inscreverAparelho, situacaoNoRegistro, type SituacaoDoPush } from '@/lib/avisos-push';
import { tokenDoCliente } from '@/lib/firebase-da-loja';

/**
 * "Avisar quando o pedido andar", na loja de verdade: o cliente recebe cada
 * etapa no celular com a página fechada, pelo Web Push — e só depois de um
 * toque; pedir sozinho, ao abrir a página, é o jeito certo de ouvir "não" e
 * nunca mais poder perguntar.
 *
 * Usa o service worker da loja, que só existe em produção
 * (`registro-do-app.tsx`); sem ele, não aparece nada. Some também quando o
 * navegador não tem push (no iPhone, só o app instalado tem) e quando o
 * servidor está sem as chaves: um convite que não cumpre o que promete é pior
 * do que nenhum.
 */
export function AvisosDoPedido({
  slug,
  paleta,
  cor,
}: {
  slug: string;
  paleta: Paleta;
  cor: string;
}) {
  const [situacao, setSituacao] = useState<SituacaoDoPush>('carregando');
  const [ocupado, setOcupado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const registro =
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration(`/pedir/${slug}`)
          : undefined;
      // Sem o worker da loja (fora de produção), não há onde receber.
      const atual = registro ? await situacaoNoRegistro(registro) : 'sem-suporte';
      if (ativo) setSituacao(atual);
    })();
    return () => {
      ativo = false;
    };
  }, [slug]);

  async function ligar() {
    setOcupado(true);
    setFalhou(false);
    try {
      const registro = await navigator.serviceWorker.getRegistration(`/pedir/${slug}`);
      const inscricao = registro ? await inscreverAparelho(registro) : null;
      const token = await tokenDoCliente();
      if (!inscricao || !token) {
        setSituacao(Notification.permission === 'denied' ? 'bloqueado' : 'desligado');
        return;
      }
      await publicStoreOrdersApi.inscreverAvisos(slug, token, inscricao);
      setSituacao('ligado');
    } catch {
      setFalhou(true);
    } finally {
      setOcupado(false);
    }
  }

  if (situacao === 'ligado') {
    return (
      <p
        role="status"
        className="flex items-center gap-2 border-b px-4 py-3 text-xs"
        style={{ borderColor: paleta.linha, color: paleta.suave }}
      >
        <BellRing className="size-4 shrink-0" aria-hidden="true" />
        Você recebe um aviso neste aparelho a cada passo do pedido, mesmo com a página fechada.
      </p>
    );
  }
  if (situacao !== 'desligado') return null;

  return (
    <div className="border-b px-4 py-3" style={{ borderColor: paleta.linha }}>
      <button
        type="button"
        onClick={ligar}
        disabled={ocupado}
        className="flex w-full items-center gap-3 text-left text-sm disabled:opacity-60"
      >
        <Bell className="size-5 shrink-0" style={{ color: cor }} aria-hidden="true" />
        <span>
          <span className="block font-medium">
            {ocupado ? 'Ligando os avisos...' : 'Avisar quando o pedido andar'}
          </span>
          <span className="block text-xs" style={{ color: paleta.suave }}>
            Aceito, saiu para entrega, entregue — mesmo com esta página fechada.
          </span>
        </span>
      </button>
      {falhou && (
        <p role="alert" className="mt-1 text-xs" style={{ color: paleta.suave }}>
          Não deu para ligar os avisos agora. Tente de novo.
        </p>
      )}
    </div>
  );
}
