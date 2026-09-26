'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CorridaDoPedido, PedidoDaLoja } from '@motoboycity/types';
import { companyStoreOrdersApi } from '@/lib/api-client';
import type { CadastroDoCliente, VendaDaLoja } from '@/lib/loja-mock';
import { rotuloDoPagamento } from '@/lib/loja-pagamentos';
import { session } from '@/lib/session';

/**
 * As vendas da loja online, do servidor: a fila de Vendas, os avisos sonoros e
 * a comanda impressa leem a mesma consulta.
 */

export const CHAVE_DAS_VENDAS = ['company', 'store', 'orders'] as const;

/** De quanto em quanto tempo a fila relê: o pedido novo aparece e toca sem recarregar. */
export const INTERVALO_DAS_VENDAS_MS = 10_000;

/**
 * A venda no formato que a tela já mostra, com o id do pedido para as ações.
 * `cadastro: null`: o cadastro do cliente ainda não é conferido no servidor —
 * a tela não afirma o que não sabe.
 */
export type VendaNoPainel = Omit<VendaDaLoja, 'cadastro'> & {
  id: string;
  cadastro: CadastroDoCliente | null;
  /** A corrida do MOTOboyCity que leva o pedido, quando há. */
  corrida: CorridaDoPedido | null;
  /** O que a loja precisa resolver na corrida. */
  avisoDaCorrida: string | null;
};

export function paraVenda(pedido: PedidoDaLoja): VendaNoPainel {
  return {
    id: pedido.id,
    numero: pedido.numero,
    modalidade: pedido.modalidade,
    etapa: pedido.etapa,
    historico: pedido.historico,
    janela: pedido.janela,
    minutosDePreparo: pedido.minutosDePreparo,
    minutosDeEntrega: pedido.minutosDeEntrega,
    cancelamento: pedido.cancelamento,
    entregaPor: pedido.entregaPor,
    cliente: pedido.cliente.nome,
    telefone: pedido.cliente.telefone,
    total: pedido.total,
    itens: pedido.itens.map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade,
      tamanho: item.tamanho,
      escolhas: item.escolhas,
      total: item.total,
    })),
    pagamento: rotuloDoPagamento(pedido.pagamento),
    trocoPara: pedido.trocoPara,
    entrega: pedido.entrega,
    cadastro: null,
    observacao: pedido.observacao,
    contaDoCliente: null,
    corrida: pedido.corrida,
    avisoDaCorrida: pedido.avisoDaCorrida,
  };
}

/** `ativa: false` não consulta — os avisos só olham a fila da loja que recebe pedidos. */
export function useVendasDaLoja(ativa = true) {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DAS_VENDAS,
    queryFn: async () => (await companyStoreOrdersApi.vendas(token as string)).map(paraVenda),
    enabled: Boolean(token) && ativa,
    refetchInterval: INTERVALO_DAS_VENDAS_MS,
  });
}

export type AcaoNaVenda =
  | {
      tipo: 'avancar';
      id: string;
      para: 'ACEITO' | 'EM_PREPARO' | 'PRONTO' | 'SAIU_PARA_ENTREGA' | 'ENTREGUE';
      minutosDePreparo?: number;
    }
  | { tipo: 'cancelar'; id: string; motivo: string }
  | { tipo: 'chamarMotoboyCity'; id: string }
  | { tipo: 'chamarDeNovo'; id: string }
  | { tipo: 'entregarComALoja'; id: string };

/**
 * O que a loja faz com uma venda. A resposta é o pedido como ficou, e ele
 * entra no lugar do antigo na fila; se o servidor recusar (outra aba já mexeu),
 * a fila é relida.
 */
export function useAcaoNaVenda() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (acao: AcaoNaVenda) => {
      const chave = token as string;
      if (acao.tipo === 'avancar') {
        return companyStoreOrdersApi.avancar(chave, acao.id, {
          para: acao.para,
          ...(acao.minutosDePreparo ? { minutosDePreparo: acao.minutosDePreparo } : {}),
        });
      }
      if (acao.tipo === 'cancelar') {
        return companyStoreOrdersApi.cancelar(chave, acao.id, { motivo: acao.motivo });
      }
      if (acao.tipo === 'chamarDeNovo') return companyStoreOrdersApi.chamarDeNovo(chave, acao.id);
      if (acao.tipo === 'entregarComALoja') {
        return companyStoreOrdersApi.entregarComALoja(chave, acao.id);
      }
      return companyStoreOrdersApi.chamarMotoboyCity(chave, acao.id);
    },
    onSuccess: (pedido) => {
      queryClient.setQueryData<VendaNoPainel[]>(CHAVE_DAS_VENDAS, (atuais) =>
        atuais?.map((venda) => (venda.id === pedido.id ? paraVenda(pedido) : venda)),
      );
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_VENDAS }),
  });
}
