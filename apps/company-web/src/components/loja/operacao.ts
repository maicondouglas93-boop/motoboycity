'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperacaoDaLoja } from '@motoboycity/types';
import { companyStoreOperationApi } from '@/lib/api-client';
import { salvarOperacao } from '@/lib/loja-demo';
import { session } from '@/lib/session';

/**
 * Como a loja funciona, no painel: a consulta e a gravação de cada bloco.
 *
 * O que a API guarda vale para a loja de verdade — a vitrine mostra o horário e
 * a situação dela.
 */

export const CHAVE_DA_OPERACAO = ['company', 'store', 'operation'] as const;

/**
 * DEMONSTRAÇÃO: enquanto o pedido não está no banco, a loja de exemplo e a tela
 * de Vendas seguem a configuração do `localStorage`. O painel copia para lá o
 * que a API guardou, e as duas continuam obedecendo ao que se configura aqui —
 * pausar no painel ainda pausa a loja de exemplo. Some junto com `loja-demo.ts`.
 */
function espelharNaDemonstracao(operacao: OperacaoDaLoja) {
  salvarOperacao(operacao);
}

export function useOperacaoDaLoja() {
  const token = session.getToken();
  return useQuery({
    queryKey: CHAVE_DA_OPERACAO,
    queryFn: async () => {
      const operacao = await companyStoreOperationApi.operation(token as string);
      espelharNaDemonstracao(operacao);
      return operacao;
    },
    enabled: Boolean(token),
  });
}

/**
 * Grava um bloco. A resposta é a operação inteira — já com o que outra aba
 * mudou nos outros blocos —, e é ela que fica no lugar.
 */
export function useGravarOperacao<T>(
  gravar: (token: string, payload: T) => Promise<OperacaoDaLoja>,
) {
  const token = session.getToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: T) => gravar(token as string, payload),
    onSuccess: (operacao) => {
      queryClient.setQueryData(CHAVE_DA_OPERACAO, operacao);
      espelharNaDemonstracao(operacao);
    },
  });
}

/**
 * Compara pelo conteúdo, e não pela ordem das chaves: o banco (JSONB) não
 * guarda essa ordem, e o "há alterações" das telas não pode depender dela.
 */
export function mesmoConteudo(a: unknown, b: unknown): boolean {
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));
}

function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([chave, item]) => [chave, ordenado(item)]),
    );
  }
  return valor;
}
