import { Power, PowerOff } from 'lucide-react';
import type { PlatformSettingsItem } from '@motoboycity/types';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { Button } from '@/components/ui/button';

type ServiceStatusSettings = Pick<
  PlatformSettingsItem,
  'acceptingOrders' | 'businessHoursEnabled'
>;

function reopenConsequence(businessHoursEnabled: boolean): string {
  return businessHoursEnabled
    ? 'O horário semanal de funcionamento continua ativo e será respeitado normalmente.'
    : 'As lojas e integrações poderão lançar novos pedidos imediatamente.';
}

export function ServiceStatusHeaderAction({
  settings,
  pending,
  onToggle,
}: {
  settings: ServiceStatusSettings | null;
  pending: boolean;
  onToggle: (nextAcceptingOrders: boolean) => Promise<unknown>;
}) {
  if (!settings) return null;

  if (settings.acceptingOrders === false) {
    return (
      <ConfirmActionDialog
        title="Abrir atendimentos?"
        description="A plataforma voltará a aceitar o lançamento de novos pedidos."
        consequence={reopenConsequence(settings.businessHoursEnabled)}
        confirmLabel="Abrir atendimentos"
        pendingLabel="Abrindo..."
        onConfirm={() => onToggle(true)}
      >
        <Button
          size="sm"
          disabled={pending}
          className="rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
        >
          <Power className="size-3.5" aria-hidden="true" />
          Abrir atendimentos
        </Button>
      </ConfirmActionDialog>
    );
  }

  return (
    <ConfirmActionDialog
      title="Finalizar atendimentos?"
      description="Novos pedidos ficarão bloqueados em toda a plataforma até você abrir os atendimentos novamente."
      consequence="Nenhuma loja, loja online, integração ou administrador conseguirá lançar novos pedidos. Os pedidos que já estão em andamento continuam normalmente até a conclusão."
      confirmLabel="Finalizar atendimentos"
      pendingLabel="Finalizando..."
      variant="destructive"
      onConfirm={() => onToggle(false)}
    >
      <Button size="sm" variant="destructive" disabled={pending} className="rounded-full shadow-sm">
        <PowerOff className="size-3.5" aria-hidden="true" />
        Finalizar atendimentos
      </Button>
    </ConfirmActionDialog>
  );
}

export function ServiceClosedHomeNotice({
  settings,
  pending,
  onReopen,
}: {
  settings: ServiceStatusSettings | null;
  pending: boolean;
  onReopen: () => Promise<unknown>;
}) {
  if (!settings || settings.acceptingOrders !== false) return null;

  return (
    <section
      aria-label="Aviso de atendimentos finalizados"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3 shadow-sm"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
        <PowerOff className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1" role="status">
        <h2 className="font-semibold text-admin-deep">Atendimentos finalizados</h2>
        <p className="text-sm text-admin-deep">
          Nenhum novo pedido pode ser lançado até você abrir os atendimentos novamente. Os pedidos
          que já estão em andamento seguem normalmente até a conclusão.
        </p>
      </div>
      <ConfirmActionDialog
        title="Abrir atendimentos?"
        description="A plataforma voltará a aceitar o lançamento de novos pedidos."
        consequence={reopenConsequence(settings.businessHoursEnabled)}
        confirmLabel="Abrir atendimentos"
        pendingLabel="Abrindo..."
        onConfirm={onReopen}
      >
        <Button
          size="sm"
          disabled={pending}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Power className="size-3.5" aria-hidden="true" />
          Abrir atendimentos
        </Button>
      </ConfirmActionDialog>
    </section>
  );
}
