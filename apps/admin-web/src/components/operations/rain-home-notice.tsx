'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SurchargeItem } from '@motoboycity/types';
import { adminSurchargesApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { RainHomeNoticeView } from './rain-home-notice-view';

const queryKey = ['admin', 'surcharges'] as const;

/** Mesmo estado do ADM/precificação, sem consultar clima diretamente no navegador. */
export function RainHomeNotice() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [deactivatedId, setDeactivatedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: () => adminSurchargesApi.list(token as string),
    enabled: Boolean(token),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => adminSurchargesApi.deactivate(token as string, id),
    onSuccess: (updated) => {
      // Só remove o aviso depois da confirmação; falha é exibida pelo diálogo.
      queryClient.setQueryData<SurchargeItem[]>(queryKey, (current) =>
        current?.map((rate) => (rate.id === updated.id ? updated : rate)),
      );
      setDeactivatedId(updated.id);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!token) return null;
  return (
    <RainHomeNoticeView
      surcharges={query.data ?? []}
      unavailable={query.isError || query.fetchStatus === 'paused'}
      pending={deactivate.isPending}
      deactivatedId={deactivatedId}
      onDeactivate={(id) => deactivate.mutateAsync(id)}
    />
  );
}
