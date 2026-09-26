'use client';

import { useEffect, useState } from 'react';
import type { PedidoDaLoja } from '@motoboycity/types';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { tokenDoCliente } from '@/lib/firebase-da-loja';

/** De quanto em quanto tempo "Meus pedidos" relê: a etapa anda sem recarregar. */
export const INTERVALO_DOS_PEDIDOS_MS = 20_000;

/**
 * Os pedidos do cliente nesta loja, do servidor.
 *
 * `null` enquanto não leu — ou sem ninguém logado —, para a tela não dizer
 * "você ainda não pediu nada" antes da resposta chegar. Com `intervaloMs`,
 * relê de tempos em tempos; sem, lê uma vez.
 */
export function usePedidosDoCliente(
  slug: string,
  usuarioId: string | null,
  intervaloMs: number | null = INTERVALO_DOS_PEDIDOS_MS,
): { pedidos: PedidoDaLoja[] | null; falhou: boolean } {
  // Guardado com a conta a que pertence: trocar de conta não mostra, nem por
  // um instante, os pedidos da anterior.
  const [lido, setLido] = useState<{ de: string; pedidos: PedidoDaLoja[] } | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (usuarioId === null) return;
    let vivo = true;
    async function ler(conta: string) {
      try {
        const token = await tokenDoCliente();
        if (!token) return;
        const pedidos = await publicStoreOrdersApi.pedidos(slug, token);
        if (vivo) {
          setLido({ de: conta, pedidos });
          setFalhou(false);
        }
      } catch {
        if (vivo) setFalhou(true);
      }
    }
    void ler(usuarioId);
    const relogio =
      intervaloMs === null ? null : window.setInterval(() => void ler(usuarioId), intervaloMs);
    return () => {
      vivo = false;
      if (relogio !== null) window.clearInterval(relogio);
    };
  }, [slug, usuarioId, intervaloMs]);

  return {
    pedidos: usuarioId !== null && lido?.de === usuarioId ? lido.pedidos : null,
    falhou,
  };
}
