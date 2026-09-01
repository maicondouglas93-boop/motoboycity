# Baseline seguro de performance

Esta primeira instrumentação é deliberadamente pequena: observa a API sem
alterar pedido, dispatch, Socket.IO, BullMQ, aplicativo, contratos ou banco.

## O que passa a existir

- Toda resposta HTTP recebe `X-Request-Id`, gerado pelo servidor.
- Requests lentos e erros 5xx geram uma linha JSON `kind=http_request` sem URL,
  query, corpo, token ou mensagem interna da exceção.
- A cada janela, a instância gera `kind=performance_snapshot` com `count`,
  média, p50, p95, p99 e máximo por controller/handler e classe HTTP.
- `GET /health` continua sendo o liveness histórico, sem dependências.
- `GET /health/ready` testa PostgreSQL e Redis em paralelo, com timeout e sem
  expor host, credencial ou erro interno.

Variáveis opcionais:

```env
SLOW_REQUEST_THRESHOLD_MS=750
PERFORMANCE_SNAPSHOT_INTERVAL_MS=60000
READINESS_TIMEOUT_MS=1500
```

`PERFORMANCE_SNAPSHOT_INTERVAL_MS=0` desliga somente os snapshots. A medição é
local, limitada e reinicia em deploy/restart; portanto os percentis representam
a janela de uma instância, não um SLO histórico de toda a plataforma.

`count`, média e máximo consideram toda a janela. Para manter custo e memória
limitados, os percentis usam no máximo as 2.048 observações mais recentes da
série; `percentileSampleCount` informa quantas entraram nesse cálculo.

## Como ler os logs

Exemplo de request lento:

```json
{"kind":"http_request","requestId":"uuid","method":"POST","operation":"DeliveriesController.create","status":201,"durationMs":912}
```

Exemplo de série no snapshot:

```json
{"operation":"DeliveriesController.create","method":"POST","statusClass":"2xx","count":18,"percentileSampleCount":18,"averageMs":640,"p50Ms":570,"p95Ms":1100,"p99Ms":1100,"maxMs":1100}
```

Filtrar primeiro estas operações:

- `DeliveriesController.create` e `createBatch`;
- `DeliveryOffersController.accept`;
- `DeliveriesController.operations`;
- o handler de operações administrativas conforme aparecer no snapshot;
- endpoints de presença e tracking.

## Readiness e rollout

Validação manual sem carga:

1. chamar `/health` e confirmar `200 {"status":"ok"}`;
2. chamar `/health/ready` e confirmar PostgreSQL e Redis como `ok`;
3. observar a rota durante um período normal de operação;
4. somente depois decidir se o provedor deve trocar seu healthcheck.

Esta alteração **não troca** `healthCheckPath` no Render. Um `503` em
`/health/ready` é diagnóstico; não derruba sozinho a instância atual.

## Checklist de infraestrutura a conferir manualmente

- região real da API;
- região real do PostgreSQL e endpoint pooled efetivo;
- região real do Redis;
- quantidade de instâncias da API;
- reinícios, memória e CPU durante os picos;
- conexões do pool e tempo de consulta no provedor do banco.

Não registrar URLs com credencial, tokens ou conteúdo de `.env` na evidência.

## Limite intencional

Esta etapa ainda não mede T0 no navegador, T9–T12 no celular nem T16–T17 na
Home. Isso exigiria alterar contratos e clientes, inclusive caminhos Android
nativos. Foi deixado para uma etapa separada para que a observabilidade inicial
não introduza risco no sistema que já está operando.
