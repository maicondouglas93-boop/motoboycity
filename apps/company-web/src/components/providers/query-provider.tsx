'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

const MINUTE_MS = 60_000;

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient();

  /**
   * Cache seletivo: modalidades e perfil mudam pouco e suas alteracoes locais
   * atualizam/invalidam o cache. Endereco de coleta, pedidos, GPS, operacao,
   * relatorios e financeiro permanecem fora desta politica por afetarem o
   * trabalho em tempo real ou valores exibidos ao cliente.
   */
  queryClient.setQueryDefaults(['service-types'], {
    staleTime: MINUTE_MS,
    gcTime: 15 * MINUTE_MS,
  });
  queryClient.setQueryDefaults(['company', 'profile'], {
    staleTime: 5 * MINUTE_MS,
    gcTime: 30 * MINUTE_MS,
  });

  return queryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
