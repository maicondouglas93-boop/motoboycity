'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHidratado } from '@/components/loja-online/armazenamento';
import { CHAVE_DA_CONFIGURACAO } from '@/components/loja/link-da-loja';
import { useOperacaoDaLoja } from '@/components/loja/operacao';
import { useVendasDaLoja, type VendaNoPainel } from '@/components/loja/vendas';
import { companyStoreSettingsApi } from '@/lib/api-client';
import {
  liberarSomNoPrimeiroToque,
  mostrarNotificacao,
  tocarAviso,
} from '@/lib/avisos-do-navegador';
import { EVENTOS_DO_LOJISTA, type EventoDoLojista } from '@/lib/loja-avisos';
import { hora, momentoNaLoja, rotuloDoDia, situacaoDaLoja } from '@/lib/loja-horario';
import { inicioDoPreparo, type EtapaDoPedido } from '@/lib/loja-pedido';
import { useAgora } from '@/lib/relogio';
import { session } from '@/lib/session';

/**
 * Os avisos do lojista enquanto o painel está aberto: pedido novo, pedido
 * cancelado pelo cliente ou pelo sistema, pedido agendado — e de novo na hora
 * de começar a prepará-lo —, e a loja fechando.
 *
 * Mora no layout do painel inteiro, e não na tela de vendas: o pedido chega
 * enquanto a lojista está em Pedidos, em Produtos ou mexendo no horário, e o
 * aviso tem que chegar do mesmo jeito. Só consulta a fila da loja que ligou os
 * pedidos pela página — as empresas que não usam a loja não pagam por ela.
 *
 * Só avisa o que acontece DEPOIS de a página abrir. O que já estava na lista
 * ao chegar não toca nada — senão cada recarregamento seria uma sirene.
 */

const REPETICAO_DO_SOM = 30_000;

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function resumo(venda: VendaNoPainel, agora: Date): string {
  const partes = [`#${venda.numero}`, venda.cliente, moeda(venda.total)];
  partes.push(venda.modalidade === 'RETIRADA' ? 'retirada' : 'entrega');
  if (venda.janela) {
    const inicio = new Date(venda.janela.inicio);
    partes.push(`para ${rotuloDoDia(momentoNaLoja(inicio).data, agora)} às ${hora(inicio)}`);
  }
  return partes.join(' · ');
}

export function AvisosDaLoja() {
  const hidratado = useHidratado();
  const token = session.getToken();
  const configuracao = useQuery({
    queryKey: CHAVE_DA_CONFIGURACAO,
    queryFn: () => companyStoreSettingsApi.settings(token as string),
    enabled: Boolean(token),
  });
  const ligada = configuracao.data?.recebePedidos === true;
  const operacao = useOperacaoDaLoja(ligada).data;
  const vendas = useVendasDaLoja(ligada).data;
  const instante = useAgora();

  const conhecidas = useRef<Map<number, EtapaDoPedido> | null>(null);
  const lembradas = useRef(new Set<number>());
  const fechamentoAvisado = useRef<number | null>(null);

  useEffect(() => liberarSomNoPrimeiroToque(), []);

  /** Toca e notifica conforme o que a loja escolheu em Notificações. */
  const avisar = useEffectEvent((evento: EventoDoLojista, texto: string, etiqueta: string) => {
    if (!operacao) return;
    const escolha = operacao.notificacoes.lojista[evento];
    const titulo = EVENTOS_DO_LOJISTA.find((item) => item.valor === evento)?.titulo ?? 'Loja';
    if (escolha.som) {
      tocarAviso(evento === 'NOVO_PEDIDO' || evento === 'PEDIDO_CANCELADO' ? 'pedido' : 'lembrete');
    }
    if (escolha.push) void mostrarNotificacao(titulo, { corpo: texto, etiqueta });
  });

  // Pedido que chegou, e pedido cancelado por outra ponta — o sistema, quando
  // o prazo do aceite vence. Nada antes de a fila chegar: a lista vazia do
  // carregamento faria cada pedido que já existia tocar como novo.
  useEffect(() => {
    if (!hidratado || !vendas) return;
    const agora = new Date();

    if (conhecidas.current === null) {
      conhecidas.current = new Map(vendas.map((venda) => [venda.numero, venda.etapa]));
      // Agendado cuja hora de preparar já passou quando a página abriu não
      // é lembrado agora: quem abriu o painel já está vendo a fila.
      for (const venda of vendas) {
        const inicio = inicioDoPreparo(venda);
        if (inicio && inicio.getTime() <= agora.getTime()) lembradas.current.add(venda.numero);
      }
      return;
    }

    for (const venda of vendas) {
      const antes = conhecidas.current.get(venda.numero);
      conhecidas.current.set(venda.numero, venda.etapa);
      if (antes === undefined) {
        avisar(
          venda.janela ? 'PEDIDO_AGENDADO' : 'NOVO_PEDIDO',
          resumo(venda, agora),
          `venda-${venda.numero}`,
        );
      } else if (
        antes !== venda.etapa &&
        venda.etapa === 'CANCELADO' &&
        venda.cancelamento?.por !== 'LOJA'
      ) {
        avisar('PEDIDO_CANCELADO', resumo(venda, agora), `venda-${venda.numero}`);
      }
    }
  }, [hidratado, vendas]);

  // Chegou a hora de começar um agendado.
  useEffect(() => {
    if (!hidratado || !vendas || instante === 0 || conhecidas.current === null) return;
    for (const venda of vendas) {
      if (venda.etapa !== 'ACEITO' || !venda.janela || lembradas.current.has(venda.numero))
        continue;
      const inicio = inicioDoPreparo(venda);
      if (!inicio || inicio.getTime() > instante) continue;
      lembradas.current.add(venda.numero);
      avisar(
        'PEDIDO_AGENDADO',
        `Hora de preparar o pedido #${venda.numero}, para as ${hora(new Date(venda.janela.inicio))}.`,
        `preparar-${venda.numero}`,
      );
    }
  }, [hidratado, instante, vendas]);

  // A loja fechando: um aviso por fechamento, e não um a cada minuto.
  useEffect(() => {
    if (!hidratado || !operacao || instante === 0) return;
    const situacao = situacaoDaLoja(operacao.funcionamento, new Date(instante));
    if (!situacao.aberta || !situacao.muda) return;
    const faltam = (situacao.muda.getTime() - instante) / 60_000;
    if (faltam > operacao.notificacoes.minutosAntesDeFechar) return;
    if (fechamentoAvisado.current === situacao.muda.getTime()) return;
    fechamentoAvisado.current = situacao.muda.getTime();
    avisar(
      'LOJA_FECHANDO',
      `A loja fecha às ${hora(situacao.muda)}. Dá para ficar aberta mais um pouco no painel.`,
      'loja-fechando',
    );
  }, [hidratado, instante, operacao]);

  /*
   * Pedido esperando aceite chama de novo a cada meio minuto, até alguém
   * aceitar ou recusar. Um toque só se perde no barulho da cozinha — e no
   * aceite manual, pedido não aceito é cliente esperando sem saber.
   */
  const esperando = vendas?.some((venda) => venda.etapa === 'NOVO') ?? false;
  const repetir =
    hidratado &&
    esperando &&
    operacao !== undefined &&
    operacao.notificacoes.repetirSom &&
    operacao.notificacoes.lojista.NOVO_PEDIDO.som;

  useEffect(() => {
    if (!repetir) return;
    const id = window.setInterval(() => tocarAviso('pedido'), REPETICAO_DO_SOM);
    return () => window.clearInterval(id);
  }, [repetir]);

  return null;
}
