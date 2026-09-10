import Link from 'next/link';
import { CloudRain } from 'lucide-react';
import type { SurchargeItem } from '@motoboycity/types';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { Button } from '@/components/ui/button';

type Props = {
  surcharges: SurchargeItem[];
  unavailable: boolean;
  pending: boolean;
  deactivatedId: string | null;
  onDeactivate: (id: string) => Promise<unknown>;
};

export function RainHomeNoticeView({
  surcharges,
  unavailable,
  pending,
  deactivatedId,
  onDeactivate,
}: Props) {
  if (unavailable) {
    return (
      <p role="status" className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
        Não foi possível confirmar o estado da taxa de chuva.{' '}
        <Link href="/configuracoes/taxas" className="font-medium underline">
          Conferir taxas
        </Link>
      </p>
    );
  }

  const activeRain = surcharges.filter(
    (rate) =>
      rate.active &&
      rate.automaticRainEnabled &&
      rate.activeNow &&
      rate.rainAutomation?.activeNow &&
      ['RAINING', 'DRYING'].includes(rate.rainAutomation.status),
  );
  const deactivated = surcharges.find((rate) => rate.id === deactivatedId && !rate.active);
  if (activeRain.length === 0 && !deactivated) return null;

  return (
    <div className="space-y-2">
      {activeRain.map((rate) => (
        <section
          key={rate.id}
          aria-label="Aviso da taxa de chuva"
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 shadow-sm"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700">
            <CloudRain className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1" role="status">
            <h2 className="font-semibold text-admin-deep">
              {rate.rainAutomation!.status === 'DRYING'
                ? 'A taxa de chuva ainda está ativa'
                : 'Chuva indicada em Lajinha'}
            </h2>
            <p className="text-sm text-admin-deep">
              {rate.rainAutomation!.status === 'DRYING'
                ? 'Sem nova indicação de chuva. O automático aguarda completar 30 minutos para desligar.'
                : 'A taxa de chuva automática está ativada para novas cotações.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Taxa: {rate.name}. Estimativa do Open-Meteo, não confirmação em cada rua.
              {rate.rainAutomation!.observedAt && (
                <>
                  {' '}
                  Dado de{' '}
                  {new Date(rate.rainAutomation!.observedAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}{' '}
                  (Brasília).
                </>
              )}{' '}
              Se não estiver chovendo, você pode desativar abaixo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ConfirmActionDialog
              title="Desativar a taxa de chuva?"
              description={`A taxa ${rate.name} deixará de ser aplicada em novas cotações.`}
              consequence="O clima não poderá religar a taxa até você reativá-la em Configurações → Taxas adicionais. Valores de pedidos já calculados não mudam."
              confirmLabel="Desativar taxa"
              pendingLabel="Desativando..."
              variant="destructive"
              onConfirm={() => onDeactivate(rate.id)}
            >
              <Button size="sm" variant="outline" disabled={pending}>
                Desativar taxa
              </Button>
            </ConfirmActionDialog>
            <Link href="/configuracoes/taxas" className="text-xs font-medium underline">
              Configurar taxa
            </Link>
          </div>
        </section>
      ))}
      {deactivated && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-admin-deep"
        >
          Taxa de chuva desativada. O automático não vai reativá-la sozinho.{' '}
          <Link href="/configuracoes/taxas" className="font-medium underline">
            Gerenciar / reativar taxa
          </Link>
        </p>
      )}
    </div>
  );
}
