import { stopDeliveryTracking } from './deliveryTracking';
import { limparSessaoNativa } from './offerSession';
import { desativarPush } from './push';
import { session } from './session';

/**
 * Remove apenas a sessao expirada. A outbox de finalizacoes fica preservada e
 * volta a aparecer quando o mesmo motoboy autenticar novamente.
 */
export async function clearExpiredDriverSession(): Promise<void> {
  await Promise.all([
    stopDeliveryTracking().catch(() => undefined),
    desativarPush({ clearLocalToken: true }).catch(() => undefined),
    limparSessaoNativa().catch(() => undefined),
  ]);
  await session.clearToken();
}
