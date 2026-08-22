'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { DeliveryDetail } from '@motoboycity/types';
import { CheckCircle2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { adminDeliveriesApi, adminDriversApi } from '@/lib/api-client';
import { session } from '@/lib/session';

/**
 * Intervenções manuais do administrador sobre um pedido.
 *
 * Ficam na página do pedido, e não num menu de contexto na fila, porque exigem
 * um motivo escrito — e uma ação que pede justificativa não cabe num menu que
 * some quando o mouse sai de cima.
 *
 * As duas existem para casos reais e específicos: o motoboy que quebrou a moto
 * no meio da corrida, e o que entregou mas nunca apertou "voltei à loja",
 * deixando o pedido travado e o repasse dele preso junto.
 */

/** Estados em que a entrega tem entregador e o repasse ainda não existe. */
const REASSIGNABLE = ['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'];
/** Estados esperando uma confirmação que o motoboy não deu. */
const FORCE_COMPLETABLE = ['DELIVERED', 'FAILED'];

export function DeliveryOverrides({ delivery }: { delivery: DeliveryDetail }) {
  const token = session.getToken();
  const queryClient = useQueryClient();

  const [driverId, setDriverId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [completeReason, setCompleteReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const podeTrocar = REASSIGNABLE.includes(delivery.status);
  const podeFinalizar = FORCE_COMPLETABLE.includes(delivery.status);

  const driversQuery = useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: () => adminDriversApi.list(token as string),
    enabled: Boolean(token) && podeTrocar,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'delivery', delivery.id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
  };
  const reportError = (mutationError: unknown, fallback: string) =>
    setError(mutationError instanceof ApiError ? mutationError.message : fallback);

  const reassignMutation = useMutation({
    mutationFn: () =>
      adminDeliveriesApi.reassignDriver(token as string, delivery.id, {
        driverId,
        reason: reassignReason.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setDriverId('');
      setReassignReason('');
      invalidate();
    },
    onError: (mutationError) => reportError(mutationError, 'Não foi possível trocar o entregador.'),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      adminDeliveriesApi.forceComplete(token as string, delivery.id, {
        reason: completeReason.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setCompleteReason('');
      invalidate();
    },
    onError: (mutationError) => reportError(mutationError, 'Não foi possível finalizar o pedido.'),
  });

  if (!token || (!podeTrocar && !podeFinalizar)) return null;

  /**
   * Só entregadores aprovados e ativos aparecem — a API recusa os demais, e
   * oferecer na lista um nome que vai voltar erro é desperdiçar o clique.
   * O atual sai da lista: trocar por ele mesmo não é troca.
   */
  const disponiveis = (driversQuery.data ?? []).filter(
    (driver) =>
      driver.approvalStatus === 'APPROVED' &&
      driver.accountStatus === 'ACTIVE' &&
      driver.id !== delivery.driver?.id,
  );

  return (
    <Card className="border-colete/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Intervenção manual</CardTitle>
        <p className="text-sm text-muted-foreground">
          Ações do administrador sobre o que aconteceu na rua. O motivo fica gravado no histórico
          deste pedido, com seu nome.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {podeTrocar && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <UserCog className="size-4" aria-hidden="true" />
              Trocar entregador
            </Label>
            <p className="text-xs text-muted-foreground">
              Mantém o número do pedido e a hora de criação — que cancelar e recriar destruiria.
            </p>
            <select
              className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
            >
              <option value="">Selecione o novo entregador</option>
              {disponiveis.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
            <textarea
              rows={2}
              value={reassignReason}
              onChange={(event) => setReassignReason(event.target.value)}
              placeholder="Motivo — ex.: moto quebrou na estrada, motoboy passou mal"
              className="w-full max-w-sm rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!driverId || reassignReason.trim().length < 5 || reassignMutation.isPending}
              onClick={() => reassignMutation.mutate()}
            >
              {reassignMutation.isPending ? 'Trocando...' : 'Trocar entregador'}
            </Button>
          </div>
        )}

        {podeFinalizar && (
          <div className="space-y-2 border-t pt-4">
            <Label className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Finalizar manualmente
            </Label>
            <p className="text-xs text-muted-foreground">
              Para quando o motoboy entregou e não confirmou o retorno. Fecha o pedido{' '}
              <strong>e libera o repasse dele</strong> — que fica preso enquanto isso não acontece.
            </p>
            <textarea
              rows={2}
              value={completeReason}
              onChange={(event) => setCompleteReason(event.target.value)}
              placeholder="Motivo — ex.: confirmado por telefone com o motoboy"
              className="w-full max-w-sm rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={completeReason.trim().length < 5 || completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
            >
              {completeMutation.isPending ? 'Finalizando...' : 'Finalizar pedido'}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
