import type { DeliveryStatus, PlatformSettingsItem } from '@motoboycity/types';

/**
 * Qual limite de alerta vale para um pedido, pelo estado em que ele está parado.
 *
 * A ideia é sempre "há quanto tempo ele espera pela PRÓXIMA coisa": esperando
 * alguém aceitar, esperando ser coletado, esperando ser entregue. Fora desses
 * três, não há sinalização — um pedido concluído ou cancelado não está parado
 * esperando nada, e um agendado está parado de propósito.
 */
export function slaAlertMinutesFor(
  status: DeliveryStatus,
  settings: Pick<
    PlatformSettingsItem,
    'slaAlertMinutesToAccept' | 'slaAlertMinutesToCollect' | 'slaAlertMinutesToDeliver'
  > | null,
): number | null {
  if (!settings) {
    return null;
  }

  switch (status) {
    case 'AWAITING_DRIVER':
      return settings.slaAlertMinutesToAccept;
    case 'ACCEPTED':
      return settings.slaAlertMinutesToCollect;
    case 'COLLECTED':
      return settings.slaAlertMinutesToDeliver;
    default:
      return null;
  }
}
