import { ApiError } from '@motoboycity/api-client';
import { stopDeliveryTracking } from './deliveryTracking';
import { getDriverProfile } from './driverProfileCache';
import { limparSessaoNativa } from './offerSession';
import { desativarPush } from './push';
import { session } from './session';

export type InitialSessionRoute = 'Login' | 'Home';

type SessionBootstrapDependencies = {
  getToken(): Promise<string | null>;
  validate(token: string): Promise<{ id?: unknown }>;
  rememberUserId(userId: string): Promise<void>;
  clearToken(): Promise<void>;
  stopTracking(): Promise<void>;
  deactivatePush(): Promise<void>;
  clearNativeSession(): Promise<void>;
};

const defaultDependencies: SessionBootstrapDependencies = {
  getToken: () => session.getToken(),
  validate: (token) => getDriverProfile(token, { force: true }),
  rememberUserId: (userId) => session.setUserId(userId),
  clearToken: () => session.clearToken(),
  stopTracking: () => stopDeliveryTracking(),
  deactivatePush: () => desativarPush({ clearLocalToken: true }),
  clearNativeSession: () => limparSessaoNativa(),
};

/**
 * Decide a primeira tela sem transformar uma indisponibilidade da API em
 * logout. Somente 401/403 provam que a credencial deixou de ser válida.
 */
export async function resolveInitialSessionRoute(
  dependencies: SessionBootstrapDependencies = defaultDependencies,
): Promise<InitialSessionRoute> {
  const token = await dependencies.getToken();
  if (!token) return 'Login';

  try {
    const profile = await dependencies.validate(token);
    if (typeof profile.id === 'string') {
      await dependencies.rememberUserId(profile.id);
    }
    return 'Home';
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) {
      return 'Home';
    }

    // O token ainda precisa existir enquanto o push tenta remover o aparelho.
    await Promise.allSettled([
      dependencies.stopTracking(),
      dependencies.deactivatePush(),
      dependencies.clearNativeSession(),
    ]);
    await dependencies.clearToken();
    return 'Login';
  }
}
