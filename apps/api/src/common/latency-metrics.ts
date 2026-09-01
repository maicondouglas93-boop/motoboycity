const DEFAULT_MAX_SAMPLES_PER_SERIES = 2_048;
const DEFAULT_MAX_SERIES = 256;

export interface LatencyMetricSnapshot {
  operation: string;
  method: string;
  statusClass: string;
  count: number;
  percentileSampleCount: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface LatencySeries {
  operation: string;
  method: string;
  statusClass: string;
  count: number;
  sumMs: number;
  maxMs: number;
  samples: number[];
  nextSampleIndex: number;
}

/**
 * Janela local e limitada de latencia HTTP.
 *
 * Ela nao substitui Prometheus/OpenTelemetry: reinicia com o processo e mede
 * apenas esta instancia. O objetivo da Fase 0 e gerar um baseline seguro nos
 * logs que o Render ja coleta, sem instalar dependencia nem abrir endpoint de
 * metricas publicamente.
 */
export class RollingLatencyMetrics {
  private readonly series = new Map<string, LatencySeries>();
  private windowStartedAt = new Date();

  constructor(
    private readonly maxSamplesPerSeries = DEFAULT_MAX_SAMPLES_PER_SERIES,
    private readonly maxSeries = DEFAULT_MAX_SERIES,
  ) {}

  observe(input: {
    operation: string;
    method: string;
    status: number;
    durationMs: number;
  }): void {
    if (!Number.isFinite(input.durationMs) || input.durationMs < 0) return;

    const statusClass = `${Math.floor(input.status / 100)}xx`;
    const key = `${input.method}:${input.operation}:${statusClass}`;
    let current = this.series.get(key);
    if (!current) {
      if (this.series.size >= this.maxSeries) return;
      current = {
        operation: input.operation,
        method: input.method,
        statusClass,
        count: 0,
        sumMs: 0,
        maxMs: 0,
        samples: [],
        nextSampleIndex: 0,
      };
      this.series.set(key, current);
    }

    current.count += 1;
    current.sumMs += input.durationMs;
    current.maxMs = Math.max(current.maxMs, input.durationMs);
    if (current.samples.length < this.maxSamplesPerSeries) {
      current.samples.push(input.durationMs);
    } else {
      current.samples[current.nextSampleIndex] = input.durationMs;
      current.nextSampleIndex = (current.nextSampleIndex + 1) % this.maxSamplesPerSeries;
    }
  }

  snapshotAndReset(now = new Date()): {
    windowStartedAt: string;
    windowEndedAt: string;
    metrics: LatencyMetricSnapshot[];
  } {
    const metrics = [...this.series.values()]
      .map((item) => {
        const sorted = [...item.samples].sort((a, b) => a - b);
        return {
          operation: item.operation,
          method: item.method,
          statusClass: item.statusClass,
          count: item.count,
          percentileSampleCount: item.samples.length,
          averageMs: this.round(item.sumMs / item.count),
          p50Ms: this.percentile(sorted, 0.5),
          p95Ms: this.percentile(sorted, 0.95),
          p99Ms: this.percentile(sorted, 0.99),
          maxMs: this.round(item.maxMs),
        };
      })
      .sort((a, b) => a.operation.localeCompare(b.operation));

    const snapshot = {
      windowStartedAt: this.windowStartedAt.toISOString(),
      windowEndedAt: now.toISOString(),
      metrics,
    };
    this.series.clear();
    this.windowStartedAt = now;
    return snapshot;
  }

  private percentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.max(0, Math.ceil(sorted.length * percentile) - 1);
    return this.round(sorted[index] ?? 0);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
