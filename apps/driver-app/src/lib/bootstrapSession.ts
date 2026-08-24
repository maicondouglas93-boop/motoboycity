import { ApiError } from '@motoboycity/api-client';
import { authApi } from './apiClient';
import { stopDeliveryTracking } from './deliveryTracking';
import { limparSessaoNativa } from './offerSession';
import { desativarPush } from './push';
import { session } from './session';

export type InitialSessionRoute = 'Login' | 'Home';

type SessionBootstrapDependencies = {
  getToken(): Promise<string | null>;
  validate(token: string): Promise<unknown>;
  clearToken(): Promise<void>;
  stopTracking(): Promise<void>;
  deactivatePush(): Promise<void>;
  clearNativeSession(): Promise<void>;
};

const defaultDependencies: SessionBootstrapDependencies = {
  getToken: () => session.getToken(),
  validate: (token) => authApi.me(token),
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
    await dependencies.validate(token);
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
