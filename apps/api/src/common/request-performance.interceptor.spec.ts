import {
  type CallHandler,
  type ExecutionContext,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestPerformanceInterceptor } from './request-performance.interceptor';

class TestController {
  execute(): void {}
}

function httpContext(statusCode = 200, setHeader = jest.fn()): ExecutionContext {
  return {
    getType: () => 'http',
    getClass: () => TestController,
    getHandler: () => TestController.prototype.execute,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET' }),
      getResponse: () => ({ statusCode, setHeader }),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('RequestPerformanceInterceptor', () => {
  const originalThreshold = process.env['SLOW_REQUEST_THRESHOLD_MS'];

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalThreshold === undefined) delete process.env['SLOW_REQUEST_THRESHOLD_MS'];
    else process.env['SLOW_REQUEST_THRESHOLD_MS'] = originalThreshold;
  });

  it('preserva a resposta e nao registra uma requisicao abaixo do limite', async () => {
    process.env['SLOW_REQUEST_THRESHOLD_MS'] = '1000000';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const interceptor = new RequestPerformanceInterceptor();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await expect(lastValueFrom(interceptor.intercept(httpContext(), next))).resolves.toEqual({
      ok: true,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('registra uma requisicao lenta sem URL, query ou corpo', async () => {
    process.env['SLOW_REQUEST_THRESHOLD_MS'] = '0';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const interceptor = new RequestPerformanceInterceptor();
    const next: CallHandler = { handle: () => of('ok') };

    await expect(lastValueFrom(interceptor.intercept(httpContext(), next))).resolves.toBe('ok');
    const logged = JSON.parse(warn.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged).toMatchObject({
      kind: 'http_request',
      method: 'GET',
      operation: 'TestController.execute',
      status: 200,
    });
    expect(logged['requestId']).toEqual(expect.any(String));
    expect(logged['durationMs']).toEqual(expect.any(Number));
  });

  it('registra 5xx e relanca o mesmo erro', async () => {
    process.env['SLOW_REQUEST_THRESHOLD_MS'] = '1000000';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const interceptor = new RequestPerformanceInterceptor();
    const failure = new InternalServerErrorException('detalhe que nao deve ir para o log');
    const next: CallHandler = { handle: () => throwError(() => failure) };

    await expect(lastValueFrom(interceptor.intercept(httpContext(), next))).rejects.toBe(failure);
    const logged = JSON.parse(logger.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(logged).toMatchObject({
      kind: 'http_request',
      method: 'GET',
      operation: 'TestController.execute',
      status: 500,
    });
    expect(logger.mock.calls[0]?.[0]).not.toContain('detalhe que nao deve ir para o log');
  });

  it('devolve um request id novo sem confiar em dados do cliente', async () => {
    process.env['SLOW_REQUEST_THRESHOLD_MS'] = '1000000';
    const setHeader = jest.fn();
    const interceptor = new RequestPerformanceInterceptor();

    await lastValueFrom(
      interceptor.intercept(httpContext(200, setHeader), { handle: () => of('ok') }),
    );

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
  });

  it('nao deixa uma falha do logger afetar a resposta', async () => {
    process.env['SLOW_REQUEST_THRESHOLD_MS'] = '0';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      throw new Error('logger indisponivel');
    });
    const interceptor = new RequestPerformanceInterceptor();
    const next: CallHandler = { handle: () => of('continua') };

    await expect(lastValueFrom(interceptor.intercept(httpContext(), next))).resolves.toBe(
      'continua',
    );
  });
});
