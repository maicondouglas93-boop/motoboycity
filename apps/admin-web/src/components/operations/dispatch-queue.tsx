'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminOnlineDriverItem } from '@motoboycity/types';
import { AlertTriangle, ArrowDown, ArrowUp, Bike, Check, RotateCcw, Save } from 'lucide-react';
import { adminOperationsApi } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function positionLabel(index: number): string {
  if (index === 0) return 'Na vez';
  if (index === 1) return 'Próximo';
  return `${index + 1}º da fila`;
}

export function DispatchQueue({
  token,
  drivers,
  generatedAt,
  onSelect,
}: {
  token: string;
  drivers: AdminOnlineDriverItem[];
  generatedAt: string;
  onSelect: (driverId: string) => void;
}) {
  const queryClient = useQueryClient();
  const serverDriverIds = drivers.map((driver) => driver.id);
  const [draftDriverIds, setDraftDriverIds] = useState(serverDriverIds);
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const dirty = draftDriverIds.join('|') !== serverDriverIds.join('|');

  const reorderMutation = useMutation({
    mutationFn: (driverIds: string[]) =>
      adminOperationsApi.reorderDispatchQueue(token, { driverIds }),
    onSuccess: async (result) => {
      setDraftDriverIds(result.driverIds);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'operations'] });
    },
  });

  function move(driverId: string, direction: -1 | 1) {
    setDraftDriverIds((current) => {
      const index = current.indexOf(driverId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
  }

  return (
    <Card className="premium-panel overflow-hidden">
      <CardHeader className="border-b border-border/60 py-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-admin-soft text-primary">
              <Bike className="size-4" aria-hidden="true" />
            </span>
            Fila de despacho
          </span>
          <Badge variant="secondary">{drivers.length} online</Badge>
        </CardTitle>
        <p className="text-[11px] leading-4 text-muted-foreground">
          A ordem vale para as próximas ofertas. Região, modalidade e capacidade continuam sendo
          respeitadas.
        </p>
      </CardHeader>

      <CardContent className="space-y-2 p-3">
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {draftDriverIds.map((driverId, index) => {
            const driver = driverById.get(driverId);
            if (!driver) return null;
            const locationAge =
              new Date(generatedAt).getTime() - new Date(driver.location.capturedAt).getTime();
            const stale = locationAge > 90_000;
            return (
              <div
                key={driver.id}
                className={`flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                  index === 0 ? 'border-primary/35 bg-admin-soft/70' : 'border-border/75 bg-card/70'
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                    index === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                  aria-label={`Posição ${index + 1}`}
                >
                  {index + 1}
                </span>
                <Avatar size="sm">
                  {driver.avatarUrl && <AvatarImage src={driver.avatarUrl} alt="" />}
                  <AvatarFallback>{initials(driver.name)}</AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(driver.id)}
                >
                  <span className="flex items-center gap-1.5">
                    <strong className="truncate text-xs">{driver.name}</strong>
                    {stale ? (
                      <AlertTriangle
                        className="size-3.5 shrink-0 text-alerta"
                        aria-label="GPS antigo"
                      />
                    ) : (
                      <Check
                        className="size-3.5 shrink-0 text-status-entregue"
                        aria-label="Online"
                      />
                    )}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {positionLabel(index)} · {driver.activeDeliveryIds.length} pedido(s) · online{' '}
                    {driver.availabilitySince
                      ? formatRelativeTime(driver.availabilitySince)
                      : 'agora'}
                  </span>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(driver.id, -1)}
                    aria-label={`Subir ${driver.name} na fila`}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={index === draftDriverIds.length - 1 || reorderMutation.isPending}
                    onClick={() => move(driver.id, 1)}
                    aria-label={`Descer ${driver.name} na fila`}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </div>
              </div>
            );
          })}

          {drivers.length === 0 && (
            <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
              Nenhum motoboy com heartbeat válido.
            </div>
          )}
        </div>

        {reorderMutation.error && (
          <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-xs text-destructive">
            {reorderMutation.error instanceof Error
              ? reorderMutation.error.message
              : 'Não foi possível salvar a fila.'}
          </p>
        )}

        {dirty && (
          <div className="flex gap-2 border-t pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={reorderMutation.isPending}
              onClick={() => setDraftDriverIds(serverDriverIds)}
            >
              <RotateCcw aria-hidden="true" />
              Desfazer
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={reorderMutation.isPending}
              onClick={() => reorderMutation.mutate(draftDriverIds)}
            >
              <Save aria-hidden="true" />
              {reorderMutation.isPending ? 'Salvando...' : 'Salvar ordem'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
