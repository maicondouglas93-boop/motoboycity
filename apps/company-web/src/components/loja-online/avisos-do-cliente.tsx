'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { mostrarNotificacao } from '@/lib/avisos-do-navegador';
import {
  EVENTOS_DO_CLIENTE_OBRIGATORIOS,
  avisoParaOCliente,
  eventoDoCliente,
} from '@/lib/loja-avisos';
import { useOperacao, useVendas } from '@/lib/loja-demo';
import { LOJA_DE_EXEMPLO, type VendaDaLoja } from '@/lib/loja-mock';
import type { EtapaDoPedido } from '@/lib/loja-pedido';
import { useHidratado } from './armazenamento';
import { useConta } from './conta';

/**
 * Avisa o cliente quando o pedido dele anda: aceito, em preparação, saiu para
 * entrega, entregue, cancelado — conforme o que a loja ligou em Notificações.
 *
 * Mora no layout da loja, para valer em qualquer tela dela: o cliente pode
 * estar olhando o cardápio de novo quando o pedido sai.
 *
 * Só avisa quando a página NÃO está na frente dele. Com "Meus pedidos" aberto,
 * a mudança já aparece na tela, e uma notificação por cima seria o mesmo
 * recado duas vezes.
 *
 * Na demonstração, depende de a página estar aberta em alguma aba — o aviso
 * com o navegador fechado precisa do push de servidor, que ainda não existe.
 */
export function AvisosDoCliente({ slug }: { slug: string }) {
  const hidratado = useHidratado();
  const { usuarioId } = useConta();
  const vendas = useVendas();
  const operacao = useOperacao();

  const conhecidas = useRef<Map<number, EtapaDoPedido> | null>(null);
  const contaConhecida = useRef<string | null>(null);

  const avisar = useEffectEvent((venda: VendaDaLoja) => {
    const evento = eventoDoCliente(venda.modalidade, venda.etapa);
    if (!evento) return;
    const ligado =
      EVENTOS_DO_CLIENTE_OBRIGATORIOS.includes(evento) || operacao.notificacoes.cliente[evento];
    if (!ligado) return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    void mostrarNotificacao(LOJA_DE_EXEMPLO.nome, {
      corpo: avisoParaOCliente(evento, venda.numero, venda.modalidade, venda.cancelamento?.motivo),
      etiqueta: `pedido-${venda.numero}`,
      icone: `/pedir/${slug}/icone/192`,
      escopo: `/pedir/${slug}`,
    });
  });

  useEffect(() => {
    if (!hidratado || usuarioId === null) return;
    const minhas = vendas.filter((venda) => venda.contaDoCliente === usuarioId);

    // Primeira vez, ou outra conta entrou neste aparelho: começa do que está
    // lá, sem avisar o histórico de ninguém.
    if (conhecidas.current === null || contaConhecida.current !== usuarioId) {
      conhecidas.current = new Map(minhas.map((venda) => [venda.numero, venda.etapa]));
      contaConhecida.current = usuarioId;
      return;
    }

    for (const venda of minhas) {
      const antes = conhecidas.current.get(venda.numero);
      conhecidas.current.set(venda.numero, venda.etapa);
      // Pedido que acabou de ser feito aqui: quem pediu já sabe.
      if (antes === undefined || antes === venda.etapa) continue;
      avisar(venda);
    }
  }, [hidratado, usuarioId, vendas]);

  return null;
}
