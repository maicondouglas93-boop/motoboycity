import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, finalize, tap } from 'rxjs';

const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 750;

function slowRequestThresholdMs(): number {
  const configured = Number(process.env['SLOW_REQUEST_THRESHOLD_MS']);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
}

function errorStatus(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status;
  }
  return 500;
}

/**
 * Observabilidade de baixa cardinalidade e sem dados pessoais.
 *
 * O log identifica somente metodo + Controller.handler. URL, parametros,
 * query string, corpo, token e mensagem da excecao nunca entram na linha. O
 * interceptor tambem nao mede consultas individuais nem altera a resposta.
 */
@Injectable()
export class RequestPerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestPerformance');
  private readonly thresholdMs = slowRequestThresholdMs();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const startedAt = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const operation = `${context.getClass().name}.${context.getHandler().name}`;
    const method = request.method ?? 'HTTP';
    let failed = false;

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          failed = true;
          this.writeLog(method, operation, errorStatus(error), this.elapsedMs(startedAt));
        },
      }),
      finalize(() => {
        if (failed) return;
        const durationMs = this.elapsedMs(startedAt);
        const status = response.statusCode ?? 200;
        if (status >= 500 || durationMs >= this.thresholdMs) {
          this.writeLog(method, operation, status, durationMs);
        }
      }),
    );
  }

  private elapsedMs(startedAt: bigint): number {
    return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }

  private writeLog(method: string, operation: string, status: number, durationMs: number): void {
    const message = `${method} ${operation} status=${status} durationMs=${durationMs}`;
    try {
      if (status >= 500) this.logger.error(message);
      else if (durationMs >= this.thresholdMs) this.logger.warn(message);
    } catch {
      // Observabilidade nunca pode derrubar ou substituir a resposta da API.
    }
  }
}
