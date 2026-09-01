import { RollingLatencyMetrics } from './latency-metrics';

describe('RollingLatencyMetrics', () => {
  it('calcula percentis por operacao e classe de status', () => {
    const metrics = new RollingLatencyMetrics();
    [10, 20, 30, 40, 100].forEach((durationMs) =>
      metrics.observe({
        operation: 'DeliveriesController.create',
        method: 'POST',
        status: 201,
        durationMs,
      }),
    );

    const snapshot = metrics.snapshotAndReset(new Date('2026-09-01T12:01:00.000Z'));

    expect(snapshot.metrics).toEqual([
      {
        operation: 'DeliveriesController.create',
        method: 'POST',
        statusClass: '2xx',
        count: 5,
        percentileSampleCount: 5,
        averageMs: 40,
        p50Ms: 30,
        p95Ms: 100,
        p99Ms: 100,
        maxMs: 100,
      },
    ]);
  });

  it('separa erros de respostas bem-sucedidas e limpa a janela', () => {
    const metrics = new RollingLatencyMetrics();
    metrics.observe({ operation: 'Test.execute', method: 'GET', status: 200, durationMs: 5 });
    metrics.observe({ operation: 'Test.execute', method: 'GET', status: 503, durationMs: 50 });

    expect(metrics.snapshotAndReset().metrics).toHaveLength(2);
    expect(metrics.snapshotAndReset().metrics).toEqual([]);
  });

  it('limita amostras e series sem deixar a observabilidade crescer sem controle', () => {
    const metrics = new RollingLatencyMetrics(2, 1);
    [10, 20, 30].forEach((durationMs) =>
      metrics.observe({ operation: 'A.execute', method: 'GET', status: 200, durationMs }),
    );
    metrics.observe({ operation: 'B.execute', method: 'POST', status: 200, durationMs: 999 });

    const [snapshot] = metrics.snapshotAndReset().metrics;
    expect(snapshot).toMatchObject({
      operation: 'A.execute',
      count: 3,
      percentileSampleCount: 2,
      averageMs: 20,
      p50Ms: 20,
      p95Ms: 30,
      maxMs: 30,
    });
  });
});
