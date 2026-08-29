import { notifyUnauthorized } from './http';

export interface ApiErrorBody {
  message?: string;
  issues?: { path: string; message: string }[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `Erro na API (HTTP ${status})`);
    this.name = 'ApiError';
  }
}

export async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
    // Ponto unico de deteccao de sessao invalida: toda rota tipada passa por
    // aqui, inclusive as que so inspecionam `response.ok`. Ver `http.ts` para o
    // motivo de 403 nao entrar.
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(response.status, errorBody);
  }
  return response.json() as Promise<T>;
}
