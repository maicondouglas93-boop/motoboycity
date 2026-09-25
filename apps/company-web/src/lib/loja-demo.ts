'use client';

import { useMemo } from 'react';
import {
  gravarGuardado,
  lerGuardado,
  useGuardado,
  useHidratado,
} from '@/components/loja-online/armazenamento';
import type { AjusteManual } from '@/lib/loja-horario';
import { OPERACAO_DE_EXEMPLO, vendasDeExemplo, type VendaDaLoja } from '@/lib/loja-mock';
import type { OperacaoDaLoja } from '@/lib/loja-operacao';
import {
  TransicaoInvalida,
  avancar,
  type Cancelamento,
  type EtapaDoPedido,
} from '@/lib/loja-pedido';

/**
 * DEMONSTRAÇÃO — faz as vezes do servidor da loja, que ainda não existe.
 * APAGAR NA INTEGRAÇÃO, junto com `loja-mock.ts`.
 *
 * Guarda no `localStorage` DESTE navegador duas coisas: como a loja funciona
 * (horário, pausa, tipos de pedido, avisos), que o painel configura, e as
 * vendas que a loja recebeu. É o que deixa as duas pontas conversarem na
 * demonstração: pausar no painel e ver a página do cliente pausar; aceitar um
 * pedido e ver o cliente acompanhar — com as duas abertas em abas do mesmo
 * navegador, porque é o evento `storage` entre abas que leva a mudança.
 *
 * O limite é exatamente o motivo de o backend existir: um pedido feito no
 * celular do cliente NÃO chega ao computador da loja. Nada daqui sai do
 * aparelho.
 */

const CHAVE_DA_OPERACAO = 'loja-demo:operacao';
const CHAVE_DAS_VENDAS = 'loja-demo:vendas';

/**
 * O que está salvo, completado com o exemplo. Uma configuração salva por uma
 * versão anterior destas telas pode não ter um bloco inteiro — sem completar,
 * a página quebraria no primeiro campo novo.
 */
export function completarOperacao(salva: Partial<OperacaoDaLoja> | null): OperacaoDaLoja {
  const base = OPERACAO_DE_EXEMPLO;
  if (!salva) return base;
  return {
    funcionamento: { ...base.funcionamento, ...salva.funcionamento },
    recebimento: { ...base.recebimento, ...salva.recebimento },
    entrega: { ...base.entrega, ...salva.entrega },
    retirada: { ...base.retirada, ...salva.retirada },
    agendamento: { ...base.agendamento, ...salva.agendamento },
    notificacoes: {
      ...base.notificacoes,
      ...salva.notificacoes,
      lojista: { ...base.notificacoes.lojista, ...salva.notificacoes?.lojista },
      cliente: { ...base.notificacoes.cliente, ...salva.notificacoes?.cliente },
    },
  };
}

export function useOperacao(): OperacaoDaLoja {
  const salva = useGuardado<Partial<OperacaoDaLoja> | null>(CHAVE_DA_OPERACAO, null);
  return useMemo(() => completarOperacao(salva), [salva]);
}

export function lerOperacao(): OperacaoDaLoja {
  return completarOperacao(lerGuardado<Partial<OperacaoDaLoja> | null>(CHAVE_DA_OPERACAO, null));
}

/**
 * Grava por blocos, relendo o que está salvo na hora: cada tela salva o dela
 * sem desfazer o que outra aba mudou no meio-tempo — a pausa, principalmente,
 * que muda a toda hora enquanto alguém edita o horário.
 */
export function salvarOperacao(mudancas: Partial<OperacaoDaLoja>): void {
  gravarGuardado(CHAVE_DA_OPERACAO, { ...lerOperacao(), ...mudancas });
}

/** Pausar, fechar ou abrir agora. `null` devolve a loja ao horário. */
export function ajustarAgora(ajuste: AjusteManual | null): void {
  const atual = lerOperacao();
  salvarOperacao({ funcionamento: { ...atual.funcionamento, ajuste } });
}

/*
 * As vendas de exemplo nascem uma vez por carregamento, com as horas contadas
 * a partir dali. Guardadas aqui, e não recriadas a cada leitura: o
 * `useSyncExternalStore` compara por identidade, e uma lista nova a cada
 * leitura seria renderização sem fim.
 */
let semente: VendaDaLoja[] | null = null;

function sementeDasVendas(): VendaDaLoja[] {
  semente ??= vendasDeExemplo(new Date());
  return semente;
}

const NENHUMA: VendaDaLoja[] = [];

/** As vendas, das mais novas às mais antigas. Vazia até a hidratação. */
export function useVendas(): VendaDaLoja[] {
  const salvas = useGuardado<VendaDaLoja[] | null>(CHAVE_DAS_VENDAS, null);
  const hidratado = useHidratado();
  if (salvas) return salvas;
  return hidratado ? sementeDasVendas() : NENHUMA;
}

export function lerVendas(): VendaDaLoja[] {
  return lerGuardado<VendaDaLoja[] | null>(CHAVE_DAS_VENDAS, null) ?? sementeDasVendas();
}

/** O pedido que a página do cliente acabou de fazer, chegando à loja. */
export function registrarVenda(venda: VendaDaLoja): void {
  gravarGuardado(CHAVE_DAS_VENDAS, [venda, ...lerVendas()]);
}

/**
 * Leva uma venda à etapa pedida, pelas mesmas regras que o servidor vai usar.
 *
 * Devolve falso quando a mudança não vale mais — outra aba já andou com o
 * pedido, ou ele foi cancelado. A tela só oferece a ação certa, mas duas abas
 * abertas no mesmo painel são o caso comum, e não um erro.
 */
export function mudarEtapa(
  numero: number,
  para: EtapaDoPedido,
  opcoes: { cancelamento?: Cancelamento; minutosDePreparo?: number } = {},
): boolean {
  const agora = new Date();
  let mudou = false;
  const vendas = lerVendas().map((venda) => {
    if (venda.numero !== numero || venda.etapa === para) return venda;
    try {
      const base =
        opcoes.minutosDePreparo === undefined
          ? venda
          : { ...venda, minutosDePreparo: opcoes.minutosDePreparo };
      mudou = true;
      return avancar(base, para, agora, opcoes.cancelamento);
    } catch (erro) {
      mudou = false;
      if (erro instanceof TransicaoInvalida) return venda;
      throw erro;
    }
  });
  if (mudou) gravarGuardado(CHAVE_DAS_VENDAS, vendas);
  return mudou;
}

/**
 * O próximo número de pedido. Na integração quem numera é o servidor; aqui a
 * lista de vendas faz esse papel, para dois clientes no mesmo navegador não
 * receberem o mesmo número.
 */
export function proximoNumeroDeVenda(): number {
  return lerVendas().reduce((maior, venda) => Math.max(maior, venda.numero), 1600) + 1;
}

/**
 * Apaga as vendas da demonstração e volta aos exemplos, com as horas contadas
 * de novo. A configuração da loja fica como está.
 */
export function recomecarVendas(): void {
  semente = null;
  gravarGuardado(CHAVE_DAS_VENDAS, null);
}
