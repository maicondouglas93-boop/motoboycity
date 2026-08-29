'use client';

import { useId, useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminDriverPunishmentItem, DriverPunishmentReason } from '@motoboycity/types';
import { Gavel, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionFeedback } from '@/components/ui/action-feedback';
import { PendingButtonLabel } from '@/components/ui/pending-button-label';
import { adminDriversApi } from '@/lib/api-client';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const MOTIVO: Record<DriverPunishmentReason, string> = {
  DECLINED_OFFER: 'recusou a oferta',
  EXPIRED_OFFER: 'deixou o prazo da oferta acabar',
};

function descrever(punicao: AdminDriverPunishmentItem): string {
  const pedido = punicao.delivery ? ` no pedido #${punicao.delivery.displayNumber}` : '';
  return `${punicao.offerCount} ${punicao.offerCount === 1 ? 'vez' : 'vezes'} seguidas — ${MOTIVO[punicao.reason]}${pedido}`;
}

/**
 * Liberação manual antes do prazo.
 *
 * O motivo é obrigatório de propósito. A punição nasce de uma regra automática;
 * desfazê-la é uma decisão humana que a contradiz, e quem olhar o histórico
 * depois precisa saber por quê — sem isso sobra só a suspeita de favorecimento.
 */
function LiberarPunicaoDialog({
  driverId,
  punishment,
  token,
  onLiberada,
}: {
  driverId: string;
  punishment: AdminDriverPunishmentItem;
  token: string;
  onLiberada: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const formId = useId();

  const mutation = useMutation({
    mutationFn: () =>
      adminDriversApi.revokePunishment(token, driverId, punishment.id, { reason: reason.trim() }),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setFormError(null);
      onLiberada();
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível liberar. Verifique a conexão e tente novamente.',
      );
    },
  });

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setFormError('Descreva o motivo da liberação.');
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  function handleOpenChange(next: boolean): void {
    if (mutation.isPending) return;
    setOpen(next);
    if (!next) {
      setReason('');
      setFormError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <ShieldCheck className="size-3.5" /> Liberar agora
          </Button>
        }
      />
      <DialogContent className="max-w-lg" closeDisabled={mutation.isPending}>
        <DialogHeader>
          <DialogTitle>Liberar do despacho agora</DialogTitle>
          <DialogDescription>
            O motoboy volta a receber ofertas imediatamente. A liberação fica registrada com seu
            nome.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id={formId} className="space-y-4" noValidate onSubmit={handleSubmit}>
            <div className="rounded-2xl border border-border/80 bg-muted/35 px-4 py-3 text-sm">
              <p className="font-medium">{descrever(punishment)}</p>
              <p className="text-muted-foreground">
                Fora do despacho até {dateFormatter.format(new Date(punishment.expiresAt))}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-reason`}>Motivo da liberação</Label>
              <Input
                id={`${formId}-reason`}
                value={reason}
                maxLength={280}
                autoComplete="off"
                placeholder="Ex.: estava sem sinal na zona rural"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            {formError && (
              <ActionFeedback tone="error" compact>
                {formError}
              </ActionFeedback>
            )}
          </form>
        </DialogBody>

        <DialogFooter className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={mutation.isPending}>
            <PendingButtonLabel pending={mutation.isPending} pendingLabel="Liberando...">
              Confirmar liberação
            </PendingButtonLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Punições deste motoboy, com a ativa em destaque.
 *
 * O cartão some quando nunca houve punição nenhuma: a maioria dos motoboys
 * nunca é punida, e um cartão vazio permanente na tela só ensina a ignorá-lo.
 */
export function DriverPunishments({ driverId, token }: { driverId: string; token: string }) {
  const queryClient = useQueryClient();
  const punishmentsQuery = useQuery({
    queryKey: ['admin', 'driver-punishments', driverId],
    queryFn: () => adminDriversApi.punishments(token, driverId),
    enabled: Boolean(token),
  });

  const punicoes = punishmentsQuery.data;
  if (!punicoes || punicoes.length === 0) return null;

  const ativa = punicoes.find((punicao) => punicao.active) ?? null;
  const historico = punicoes.filter((punicao) => punicao !== ativa).slice(0, 5);

  return (
    <Card className={ativa ? 'border-alerta/40' : undefined}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Gavel className="size-4" aria-hidden="true" /> Punições por recusa
        </CardTitle>
        {ativa && (
          <LiberarPunicaoDialog
            driverId={driverId}
            punishment={ativa}
            token={token}
            onLiberada={() =>
              void queryClient.invalidateQueries({
                queryKey: ['admin', 'driver-punishments', driverId],
              })
            }
          />
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {ativa ? (
          <ActionFeedback tone="warning" title="Fora do despacho agora">
            {descrever(ativa)}. Não recebe oferta nova nem consegue pegar pedido na lista de
            disponíveis até {dateFormatter.format(new Date(ativa.expiresAt))}. As entregas que já
            estavam com ele seguem normalmente.
          </ActionFeedback>
        ) : (
          <p className="text-muted-foreground">
            Nenhuma punição em vigor. Ele está recebendo ofertas normalmente.
          </p>
        )}

        {historico.length > 0 && (
          <ul className="space-y-2">
            {historico.map((punicao) => (
              <li
                key={punicao.id}
                className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2"
              >
                <p className="font-medium text-admin-deep">{descrever(punicao)}</p>
                <p className="text-xs text-muted-foreground">
                  {dateFormatter.format(new Date(punicao.appliedAt))} · {punicao.minutes} min
                  {punicao.revokedAt && (
                    <>
                      {' '}
                      · liberada por {punicao.revokedBy?.name ?? 'um administrador'}:{' '}
                      {punicao.revokedReason}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
