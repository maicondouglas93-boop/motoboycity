'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PedidoDaLoja } from '@motoboycity/types';
import { publicStoreOrdersApi } from '@/lib/api-client';
import { tokenDoCliente } from '@/lib/firebase-da-loja';

/** De quanto em quanto tempo "Meus pedidos" relê: a etapa anda sem recarregar. */
export const INTERVALO_DOS_PEDIDOS_MS = 20_000;

/**
 * Com Pix esperando, relê mais depressa: o cliente acabou de pagar e está
 * olhando a tela — o aviso do Asaas chega em segundos, e a tela tem de mudar
 * junto.
 */
export const INTERVALO_COM_PIX_MS = 5_000;

/**
 * Os pedidos do cliente nesta loja, do servidor.
 *
 * `null` enquanto não leu — ou sem ninguém logado —, para a tela não dizer
 * "você ainda não pediu nada" antes da resposta chegar. Com `intervaloMs`,
 * relê de tempos em tempos; sem, lê uma vez. `substituir` põe no lugar o
 * pedido que uma ação acabou de devolver ("Já paguei"), sem esperar a leitura.
 */
export function usePedidosDoCliente(
  slug: string,
  usuarioId: string | null,
  intervaloMs: number | null = INTERVALO_DOS_PEDIDOS_MS,
): {
  pedidos: PedidoDaLoja[] | null;
  falhou: boolean;
  substituir: (pedido: PedidoDaLoja) => void;
} {
  // Guardado com a conta a que pertence: trocar de conta não mostra, nem por
  // um instante, os pedidos da anterior.
  const [lido, setLido] = useState<{ de: string; pedidos: PedidoDaLoja[] } | null>(null);
  const [falhou, setFalhou] = useState(false);
  const esperandoPix =
    lido?.pedidos.some((pedido) => pedido.etapa === 'AGUARDANDO_PAGAMENTO') ?? false;
  const intervalo = intervaloMs === null ? null : esperandoPix ? INTERVALO_COM_PIX_MS : intervaloMs;

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
      intervalo === null ? null : window.setInterval(() => void ler(usuarioId), intervalo);
    return () => {
      vivo = false;
      if (relogio !== null) window.clearInterval(relogio);
    };
  }, [slug, usuarioId, intervalo]);

  const substituir = useCallback((pedido: PedidoDaLoja) => {
    setLido((atual) =>
      atual
        ? {
            ...atual,
            pedidos: atual.pedidos.map((item) => (item.id === pedido.id ? pedido : item)),
          }
        : atual,
    );
  }, []);

  return {
    pedidos: usuarioId !== null && lido?.de === usuarioId ? lido.pedidos : null,
    falhou,
    substituir,
  };
}
