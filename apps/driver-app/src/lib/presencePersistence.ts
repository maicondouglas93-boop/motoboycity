import { ApiError } from '@motoboycity/api-client';
import type { DriverLiveLocationInput, DriverPresenceItem } from '@motoboycity/types';

export interface PresencePersistenceDependencies {
  captureLocation(): Promise<DriverLiveLocationInput>;
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  activate(location: DriverLiveLocationInput): Promise<DriverPresenceItem>;
}

/**
 * Erros de rede e indisponibilidade do servidor nao anulam a escolha do
 * motoboy de permanecer online. O servico nativo continua vivo e tenta
 * reafirmar a presenca quando a conexao voltar.
 */
export function isTransientPresenceError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return (
    error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500
  );
}

/**
 * Reafirma uma presenca expirada sem desligar o rastreamento numa simples
 * queda de internet. Erro definitivo (sessao/conta/payload) encerra o servico
 * para impedir que uma sessao invalida tente religar o motoboy indefinidamente.
 */
export async function restoreDesiredPresence(
  currentPresence: DriverPresenceItem | null,
  dependencies: PresencePersistenceDependencies,
): Promise<DriverPresenceItem> {
  await dependencies.startTracking();
  if (currentPresence?.availability === 'AVAILABLE') return currentPresence;

  const location = await dependencies.captureLocation();
  try {
    return await dependencies.activate(location);
  } catch (error) {
    if (!isTransientPresenceError(error)) {
      await dependencies.stopTracking().catch(() => undefined);
    }
    throw error;
  }
}
