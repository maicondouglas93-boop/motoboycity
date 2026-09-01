import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, finalize, tap } from 'rxjs';
import { RollingLatencyMetrics } from './latency-metrics';

const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 750;
const DEFAULT_SNAPSHOT_INTERVAL_MS = 60_000;

function slowRequestThresholdMs(): number {
  const configured = Number(process.env['SLOW_REQUEST_THRESHOLD_MS']);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
}

function snapshotIntervalMs(): number {
  if (process.env['NODE_ENV'] === 'test') return 0;
  const configured = Number(process.env['PERFORMANCE_SNAPSHOT_INTERVAL_MS']);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SNAPSHOT_INTERVAL_MS;
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
 * interceptor tambem nao mede consultas individuais nem altera corpo/status.
 * O unico metadado novo na resposta e `X-Request-Id`.
 */
@Injectable()
export class RequestPerformanceInterceptor implements NestInterceptor, OnModuleDestroy {
  private readonly logger = new Logger('RequestPerformance');
  private readonly thresholdMs = slowRequestThresholdMs();
  private readonly metrics = new RollingLatencyMetrics();
  private readonly snapshotTimer: NodeJS.Timeout | null;

  constructor() {
    const intervalMs = snapshotIntervalMs();
    this.snapshotTimer =
      intervalMs > 0
        ? setInterval(() => {
            this.writeSnapshot();
          }, intervalMs)
        : null;
    this.snapshotTimer?.unref();
  }

  onModuleDestroy(): void {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const startedAt = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode?: number; setHeader?: (name: string, value: string) => void }>();
    const operation = `${context.getClass().name}.${context.getHandler().name}`;
    const method = request.method ?? 'HTTP';
    const requestId = randomUUID();
    response.setHeader?.('X-Request-Id', requestId);
    let failed = false;

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          failed = true;
          const durationMs = this.elapsedMs(startedAt);
          const status = errorStatus(error);
          this.metrics.observe({ method, operation, status, durationMs });
          this.writeLog(requestId, method, operation, status, durationMs);
        },
      }),
      finalize(() => {
        if (failed) return;
        const durationMs = this.elapsedMs(startedAt);
        const status = response.statusCode ?? 200;
        this.metrics.observe({ method, operation, status, durationMs });
        if (status >= 500 || durationMs >= this.thresholdMs) {
          this.writeLog(requestId, method, operation, status, durationMs);
        }
      }),
    );
  }

  private elapsedMs(startedAt: bigint): number {
    return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }

  private writeLog(
    requestId: string,
    method: string,
    operation: string,
    status: number,
    durationMs: number,
  ): void {
    const message = JSON.stringify({
      kind: 'http_request',
      requestId,
      method,
      operation,
      status,
      durationMs,
    });
    try {
      if (status >= 500) this.logger.error(message);
      else if (durationMs >= this.thresholdMs) this.logger.warn(message);
    } catch {
      // Observabilidade nunca pode derrubar ou substituir a resposta da API.
    }
  }

  private writeSnapshot(): void {
    const snapshot = this.metrics.snapshotAndReset();
    if (snapshot.metrics.length === 0) return;
    const memory = process.memoryUsage();
    const chunkSize = 25;
    const chunks = Array.from(
      { length: Math.ceil(snapshot.metrics.length / chunkSize) },
      (_, index) => snapshot.metrics.slice(index * chunkSize, (index + 1) * chunkSize),
    );
    try {
      chunks.forEach((metrics, index) =>
        this.logger.log(
          JSON.stringify({
            kind: 'performance_snapshot',
            windowStartedAt: snapshot.windowStartedAt,
            windowEndedAt: snapshot.windowEndedAt,
            part: index + 1,
            parts: chunks.length,
            metrics,
            process: {
              uptimeSeconds: Math.round(process.uptime()),
              rssBytes: memory.rss,
              heapUsedBytes: memory.heapUsed,
            },
          }),
        ),
      );
    } catch {
      // A coleta e best-effort; falha de log nunca afeta o trafego da API.
    }
  }
}
