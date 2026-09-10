import type { SurchargeItem } from '@motoboycity/types';
import { ChevronDown, Pencil, Power, Trash2 } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SurchargeActivationControls } from './surcharge-activation-controls';
import { RainAutomationDetails, RainAutomationStatus } from './rain-automation-status';

type Props = {
  surcharge: SurchargeItem;
  amount: string;
  scheduleLabels: { id: string; label: string }[];
  pending: boolean;
  onEdit: () => void;
  onModeChange: (automatic: boolean) => void;
  onManualChange: (on: boolean) => void;
  onActiveChange: () => Promise<unknown>;
  onRemove: () => Promise<unknown>;
};

/** Apenas apresentação: estado e ações continuam confirmados pela API. */
export function SurchargeCard({
  surcharge,
  amount,
  scheduleLabels,
  pending,
  onEdit,
  onModeChange,
  onManualChange,
  onActiveChange,
  onRemove,
}: Props) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-semibold">{surcharge.name}</h3>
            {/* A API resolve o estado; não recalcular clima/horários no navegador. */}
            <Badge
              variant="secondary"
              className={surcharge.active && surcharge.activeNow ? 'bg-colete text-asfalto' : ''}
            >
              {!surcharge.active
                ? 'Taxa desativada'
                : surcharge.activeNow
                  ? 'Valendo agora'
                  : 'Aguardando ativação'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{amount}</span>
            {' · '}
            {surcharge.driverSharePercentage}% ao entregador
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" disabled={pending} onClick={onEdit}>
            <Pencil className="size-4" /> Editar
          </Button>
          <ConfirmActionDialog
            title={`${surcharge.active ? 'Desativar' : 'Reativar'} ${surcharge.name}?`}
            description="Confirme a mudança desta taxa adicional."
            consequence={
              surcharge.active
                ? 'A taxa deixará de ser aplicada em novas cotações, inclusive pelo clima e por horários programados. Preços já calculados não mudam.'
                : 'A taxa voltará a participar das novas cotações conforme o modo selecionado: clima automático ou manual/horários.'
            }
            confirmLabel={surcharge.active ? 'Desativar taxa' : 'Reativar taxa'}
            pendingLabel={surcharge.active ? 'Desativando...' : 'Reativando...'}
            variant={surcharge.active ? 'destructive' : 'default'}
            onConfirm={onActiveChange}
          >
            <Button variant={surcharge.active ? 'outline' : 'default'} disabled={pending}>
              <Power className="size-4" />
              {surcharge.active ? 'Desativar taxa' : 'Reativar taxa'}
            </Button>
          </ConfirmActionDialog>
        </div>
      </header>

      <div
        className={`grid gap-5 border-t bg-muted/20 p-5 ${surcharge.rainAutomation ? 'lg:grid-cols-2' : ''}`}
      >
        <SurchargeActivationControls
          surcharge={surcharge}
          pending={pending}
          onModeChange={onModeChange}
          onManualChange={onManualChange}
        />
        {surcharge.rainAutomation && (
          <div className="border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
            <RainAutomationStatus
              automation={surcharge.rainAutomation}
              enabled={surcharge.active}
              automaticEnabled={surcharge.automaticRainEnabled}
            />
          </div>
        )}
      </div>

      <details className="group border-t">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm text-muted-foreground hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          Detalhes e horários
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 px-5 pt-1 pb-5 text-xs leading-relaxed text-muted-foreground">
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Horários programados</p>
            {scheduleLabels.length > 0 ? (
              <>
                <p>
                  {surcharge.automaticRainEnabled
                    ? 'Guardados, sem efeito no modo automático.'
                    : 'Podem ativar a taxa mesmo com o manual desligado.'}
                </p>
                <ul className="list-inside list-disc">
                  {scheduleLabels.map(({ id, label }) => (
                    <li key={id}>{label}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Nenhum horário cadastrado.</p>
            )}
          </div>
          <RainAutomationDetails automation={surcharge.rainAutomation} />
          <p className="break-all">ID da taxa: {surcharge.id}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p>Excluir remove a configuração. Para parar a cobrança, prefira Desativar taxa.</p>
            <ConfirmActionDialog
              title={`Excluir ${surcharge.name}?`}
              description="Confirme a exclusão definitiva desta taxa adicional."
              consequence="A configuração e todas as suas janelas serão removidas. O histórico administrativo preservará quem fez a exclusão."
              confirmLabel="Excluir taxa"
              pendingLabel="Excluindo..."
              variant="destructive"
              onConfirm={onRemove}
            >
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
              >
                <Trash2 className="size-4" /> Excluir taxa
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      </details>
    </article>
  );
}
