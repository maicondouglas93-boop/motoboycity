/**
 * Camada de transporte compartilhada por todos os clientes tipados.
 *
 * Existe por dois motivos que so aparecem em rede movel ruim:
 *
 * 1. `fetch` NAO tem timeout padrao. Um 4G que conecta e nao trafega — elevador,
 *    subsolo, borda de celula — deixa a requisicao pendurada para sempre, e a
 *    tela que esperava por ela nunca sai do carregamento. No aplicativo do
 *    motoboy isso aparecia como "o app travou": o botao Ativo ficava
 *    desabilitado esperando uma resposta que nunca vinha.
 * 2. Um 401 precisa de UMA reacao em todo o aplicativo, e nao de uma decisao
 *    por tela. Sem isso, uma credencial revogada virava "Pedido indisponivel"
 *    numa tela, silencio em outra, e nenhuma dizia a unica coisa util: entre de
 *    novo.
 *
 * A configuracao e por processo, e nao por chamada: quem consome monta os
 * clientes uma vez no boot e chama `configureApiClient` no mesmo lugar.
 */

/**
 * Desligado por padrao — quem quer prazo, pede.
 *
 * O timeout entrou por causa do aplicativo do motoboy, que trabalha em rede
 * movel e nao pode ficar pendurado. Ligar um prazo global tambem para os
 * paineis mudaria o comportamento de telas que ninguem pediu para tocar, e
 * algumas sao legitimamente lentas: exportacao de CSV e relatorio administrativo
 * podem passar de meio minuto sem que nada esteja errado.
 *
 * Cada aplicativo decide o proprio prazo em `configureApiClient`.
 */
const DEFAULT_TIMEOUT_MS = 0;

let timeoutMs = DEFAULT_TIMEOUT_MS;
let unauthorizedHandler: (() => void) | null = null;

/**
 * Requisicao que estourou o prazo local.
 *
 * Nao e `ApiError`: nenhum status chegou do servidor, e tratar isso como HTTP
 * levaria quem consome a inventar um significado para um numero que nao existe.
 * Quem precisa distinguir "o servidor recusou" de "nao houve resposta" usa esta
 * classe; quem so precisa avisar o usuario usa a mensagem.
 */
export class ApiTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super('O servidor demorou demais para responder. Confira o sinal e tente novamente.');
    this.name = 'ApiTimeoutError';
  }
}

export interface ApiClientOptions {
  /** Prazo maximo por requisicao. `0` desliga o timeout. */
  timeoutMs?: number;
  /**
   * Chamado quando qualquer requisicao responde 401.
   *
   * SOMENTE 401. Nesta API o 403 e decisao de negocio — motoboy em punicao,
   * oferta de outra pessoa, pedido de outra empresa — e derrubar a sessao nesses
   * casos deslogaria o motoboy no meio do expediente por uma regra que esta
   * funcionando como deveria.
   */
  onUnauthorized?: (() => void) | null;
}

export function configureApiClient(options: ApiClientOptions): void {
  if (options.timeoutMs !== undefined) timeoutMs = options.timeoutMs;
  if (options.onUnauthorized !== undefined) unauthorizedHandler = options.onUnauthorized;
}

/** Usado por `parseJsonOrThrow`; nunca deixa o erro do handler derrubar a chamada. */
export function notifyUnauthorized(): void {
  if (!unauthorizedHandler) return;
  try {
    unauthorizedHandler();
  } catch {
    // A resposta 401 ja e o resultado da chamada. Uma falha ao avisar a sessao
    // nao pode virar uma segunda excecao por cima da primeira.
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (timeoutMs <= 0) return fetch(input, init);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    // `AbortError` e a mesma excecao para "estourou o prazo" e para "alguem
    // cancelou". Aqui so existe o primeiro caso, porque o controller e local.
    if (controller.signal.aborted) throw new ApiTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
