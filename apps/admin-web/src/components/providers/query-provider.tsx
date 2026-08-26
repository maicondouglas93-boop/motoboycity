'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

const MINUTE_MS = 60_000;

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient();

  /**
   * Somente cadastros de referencia recebem uma janela de frescor. Dados de
   * operacao, GPS, pedidos, filas, relatorios e financeiro continuam com o
   * comportamento padrao ou com os pollings/realtime definidos nas telas.
   *
   * As mutacoes destes cadastros ja invalidam os mesmos prefixos. Manter o
   * refetch em foco/reconexao no padrao tambem reconcilia alteracoes feitas em
   * outra aba assim que a janela expira.
   */
  queryClient.setQueryDefaults(['admin', 'regions'], {
    staleTime: 5 * MINUTE_MS,
    gcTime: 30 * MINUTE_MS,
  });
  queryClient.setQueryDefaults(['admin', 'service-types'], {
    staleTime: MINUTE_MS,
    gcTime: 15 * MINUTE_MS,
  });
  queryClient.setQueryDefaults(['admin', 'pricing-tables'], {
    staleTime: MINUTE_MS,
    gcTime: 15 * MINUTE_MS,
  });
  queryClient.setQueryDefaults(['admin', 'platform-settings'], {
    staleTime: MINUTE_MS,
    gcTime: 15 * MINUTE_MS,
  });
  queryClient.setQueryDefaults(['admin', 'company-registration-options'], {
    staleTime: 5 * MINUTE_MS,
    gcTime: 30 * MINUTE_MS,
  });
  queryClient.setQueryDefaults(['admin', 'driver-registration-options'], {
    staleTime: 5 * MINUTE_MS,
    gcTime: 30 * MINUTE_MS,
  });

  return queryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
