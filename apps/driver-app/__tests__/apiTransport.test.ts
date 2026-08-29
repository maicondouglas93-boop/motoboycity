import {
  ApiError,
  ApiTimeoutError,
  apiFetch,
  configureApiClient,
  parseJsonOrThrow,
} from '@motoboycity/api-client';

/**
 * `fetch` NAO tem timeout padrao.
 *
 * Um 4G que conecta e nao trafega — elevador, subsolo, borda de celula — deixava
 * a requisicao pendurada para sempre, e a tela que esperava por ela nunca saia
 * do carregamento. No aplicativo do motoboy isso aparecia como travamento: o
 * botao Ativo ficava desabilitado esperando uma resposta que nunca vinha.
 */
describe('transporte do api-client', () => {
  const fetchOriginal = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    configureApiClient({ timeoutMs: 0, onUnauthorized: null });
    jest.useRealTimers();
  });

  it('desiste da requisicao pendurada dentro do prazo configurado', async () => {
    // Nunca resolve, e nunca rejeita: exatamente o comportamento da rede movel
    // que este timeout existe para cobrir.
    globalThis.fetch = jest.fn(
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')));
        }),
    ) as unknown as typeof fetch;

    configureApiClient({ timeoutMs: 30 });

    await expect(apiFetch('https://exemplo.invalido/pedidos')).rejects.toBeInstanceOf(
      ApiTimeoutError,
    );
  });

  it('preserva o metodo e os cabecalhos de quem chamou', async () => {
    const espiao = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = espiao as unknown as typeof fetch;
    configureApiClient({ timeoutMs: 5_000 });

    await apiFetch('https://exemplo.invalido/presenca', {
      method: 'PUT',
      headers: { Authorization: 'Bearer abc' },
    });

    const [, init] = espiao.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ Authorization: 'Bearer abc' });
    expect(init.signal).toBeDefined();
  });

  it('timeout zero desliga a desistencia', async () => {
    const espiao = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = espiao as unknown as typeof fetch;
    configureApiClient({ timeoutMs: 0 });

    await apiFetch('https://exemplo.invalido/qualquer');

    const [, init] = espiao.mock.calls[0] as [string, RequestInit | undefined];
    expect(init?.signal).toBeUndefined();
  });

  /**
   * SOMENTE 401. Nesta API o 403 e decisao de negocio — motoboy em punicao,
   * oferta de outra pessoa — e derrubar a sessao nesses casos deslogaria o
   * motoboy no meio do expediente por uma regra funcionando como deveria.
   */
  it('avisa a sessao em 401 e ignora 403', async () => {
    const aviso = jest.fn();
    configureApiClient({ onUnauthorized: aviso });

    await expect(
      parseJsonOrThrow(new Response('{"message":"nao autorizado"}', { status: 401 })),
    ).rejects.toBeInstanceOf(ApiError);
    expect(aviso).toHaveBeenCalledTimes(1);

    await expect(
      parseJsonOrThrow(new Response('{"message":"voce esta fora do despacho"}', { status: 403 })),
    ).rejects.toBeInstanceOf(ApiError);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('um aviso com problema nao vira uma segunda excecao por cima do 401', async () => {
    configureApiClient({
      onUnauthorized: () => {
        throw new Error('falhou ao limpar a sessao');
      },
    });

    await expect(parseJsonOrThrow(new Response('{}', { status: 401 }))).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
