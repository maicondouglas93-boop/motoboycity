# Handoff de engenharia — MOTOboyCity

> Fonte de continuidade para pessoas e agentes de IA. Atualize este arquivo em
> cada mudanca funcional, de contrato, infraestrutura ou validacao. Nao inclua
> secrets, valores de `.env` ou dados de clientes.

## Como usar e atualizar

Antes de alterar o projeto, leia este arquivo e `AGENTS.md`. Depois de cada
recorte de trabalho, atualize:

1. **Historico de mudancas** com decisao e arquivos relevantes;
2. **Estado atual** se o comportamento exposto mudou;
3. **Validacoes** com os comandos realmente executados e resultado;
4. **Limitacoes e proximos passos** — nao marque um item como concluido sem
   evidencia de codigo e teste.

Mantenha este documento factual e conciso. O README e documentacao de produto e
onboarding; este arquivo e o estado operacional de desenvolvimento.

## Estado atual

### Plataforma

Monorepo PNPM/Turborepo com API NestJS/Prisma/PostgreSQL/Redis-BullMQ/
Socket.IO, os paineis Next.js `company-web` e `admin-web`, e o aplicativo React
Native `driver-app`. Os contratos compartilhados vivem em `packages/types`,
`packages/validation` e `packages/api-client`.

O README ainda descreve a antiga “Fase 0” e nao representa a implementacao
atual. Nao o use como fonte de verdade para endpoints ou recursos ja
implementados.

### Fluxos ja implementados

- Autenticacao JWT e perfis de empresa, entregador e admin;
- Aprovacao de empresas e entregadores, endereco primario da empresa, tipos de
  servico e tabelas de preco;
- Criacao, listagem, detalhe e cancelamento de pedidos individuais;
- Preco calculado e congelado na criacao; despacho em BullMQ, presenca do
  entregador e oferta via Socket.IO;
- Aceite/recusa de oferta com protecao condicional contra corrida no fluxo de
  pedido individual;
- Pedidos em lote, descritos a seguir.
- Elegibilidade de dispatch por regiao, modalidade atribuida e carga
  operacional; o backfill de modalidades e manual pelo painel admin.
- Ciclo de entrega pos-aceite (`collect`/`deliver`/`complete-return`) no
  backend, incluindo o modo opcional de destino capturado por GPS na entrega
  em vez de informado na criacao — ver "Contrato do ciclo de entrega".
  Nenhuma tela consome isso ainda.

Telas que importam `mock-data` ainda nao devem ser tratadas como integradas.
Os fluxos integrados e os mocks coexistem nos paineis e no app mobile.

## Contrato de pedidos em lote

### Decisoes adotadas — 2026-08-13

1. Um lote e um grupo de **2 a 50 entregas imediatas** criadas na mesma
   chamada; agendamento de lote nao e suportado nesta versao.
2. Nao ha uma tabela `DeliveryBatch`. Um UUID gerado pela aplicacao e gravado
   em `Delivery.batchId`; `null` preserva o pedido individual existente.
3. Cada item do lote mantem destino estruturado, distancia e valores de preco
   proprios, todos calculados e congelados durante a criacao. O caminho de
   “destino definido por GPS somente na entrega” foi descartado por nao haver
   ainda maquina de estados, calculo de valor ou prova de entrega que o suporte
   com seguranca.
4. O lote e uma unidade de despacho: as entregas recebem oferta para o mesmo
   motoboy, e aceite, recusa, expiracao e cancelamento se aplicam a todos os
   itens do lote.
5. A auditoria continua granular: existe uma `DeliveryOffer` e uma entrada de
   historico de status por entrega. O payload em realtime usa a primeira oferta
   como referencia e informa `batchId`/`deliveryCount` para o aplicativo.

### API e contratos

`POST /deliveries/batch` requer autenticacao JWT de empresa e aceita:

```json
{
  "deliveries": [
    {
      "serviceTypeId": "uuid",
      "dropoffAddress": {
        "street": "Rua Exemplo",
        "number": "100",
        "city": "Lajinha",
        "state": "MG",
        "zip": "36930000"
      },
      "requiresReturn": false,
      "requiresDeliveryProof": false,
      "requiresCollectionRecipient": false,
      "pickupSurchargeChargedToDriver": false
    }
  ]
}
```

Resposta: `{ batchId, deliveries }`, em que `deliveries` usa o mesmo formato
de detalhe de pedido e inclui `batchId`.

Arquivos de contrato:

- `packages/validation/src/deliveries/create-delivery.schema.ts` — validacao
  Zod e limite do lote;
- `packages/types/src/delivery.ts` — payload e retorno do lote;
- `packages/types/src/delivery-offer.ts` — campos do evento e resultado de
  aceite de lote;
- `packages/api-client/src/deliveries.ts` — `deliveriesApi.createBatch()`.

### Persistencia e despacho

- Migration criada e validada em banco vazio:
  `apps/api/prisma/migrations/20260813195000_add_delivery_batch/migration.sql`.
  Ela adiciona `deliveries.batchId` e seu indice; nao modifica migrations ja
  aplicadas. Ainda nao foi aplicada em desenvolvimento ou staging.
- A criacao calcula Maps/preco de todos os itens antes da transacao e grava as
  entregas, enderecos e historicos em uma unica transacao.
- `DispatchService.dispatchDelivery()` identifica o grupo por `batchId`, cria
  todas as ofertas em transacao e agenda um timeout por oferta. Apenas um
  evento agregado e enviado ao motoboy.
- A criacao de oferta bloqueia as entregas, revalida o status dentro de uma
  transacao serializavel e e protegida pelo indice unico parcial de ofertas
  pendentes descrito em P1-01.
- Aceitar qualquer uma das ofertas do lote aceita, atribui e registra historico
  de todos os itens em uma transacao. Recusar ou expirar uma oferta marca todas
  as ofertas pendentes do lote e tenta despachar o grupo novamente.
- Cancelar qualquer item antes do aceite cancela todos os itens do lote e
  invalida suas ofertas/jobs.

## Contrato do ciclo de entrega

### Decisoes adotadas — 2026-08-16

1. Depois de ACCEPTED, o motoboy avanca a entrega por tres acoes novas, todas
   `PATCH`, guardadas por `DriverOnlyGuard` (sem sobreposicao de admin —
   coletar/entregar/retornar sao acoes fisicas do motoboy):
   - `PATCH /deliveries/:id/collect` — atomica pro lote inteiro
     (`ACCEPTED → COLLECTED` em todos os itens de uma vez, exige que todos
     estejam ACCEPTED).
   - `PATCH /deliveries/:id/deliver` — por item, um de cada vez. Corpo
     `{ lat?, lng? }`.
   - `PATCH /deliveries/:id/complete-return` — atomica, mas so afeta os itens
     `DELIVERED` com `requiresReturn=true` do lote (filtro, nao tudo-ou-nada).
     Corpo `{ lat, lng }` sempre obrigatorio.
2. Novo campo `Delivery.destinationKnownAtCreation` (default `true`,
   consistente em todos os itens de um lote — validado em Zod). `true`:
   comportamento de sempre, endereco e preco na criacao. `false`: pedido
   nasce so com endereco PICKUP; `distanceKm`/`totalValue`/`driverValue`/
   `platformValue` ficam nulos ate `deliver()`. Nesse modo, `lat`/`lng` no
   corpo de `deliver()` sao obrigatorios — viram o destino, criando a linha
   DROPOFF (campos estruturados nulos, so lat/lng preenchidos — sem
   geocodificacao reversa) e disparando o mesmo `GoogleMapsService`/
   `PricingService` que a criacao usaria, agora retroativamente.
3. Fechamento automatico: item sem `requiresReturn` vira `COMPLETED` sozinho
   no mesmo `deliver()` que o leva a `DELIVERED` (as duas transicoes ficam no
   historico, mesmo sendo quase simultaneas). Item com `requiresReturn=true`
   fica em `DELIVERED` ate `complete-return` aprovar a proximidade.
4. `complete-return` calcula distancia em linha reta (Haversine, novo
   `apps/api/src/common/haversine.ts` — nao rota real) entre o lat/lng
   informado e o endereco de coleta da empresa, comparando contra
   `PlatformSettings.returnProximityRadiusMeters` (novo, nullable-ate-
   configurar, mesmo padrao de `dispatchOfferTimeoutSeconds`: falha com erro
   claro em vez de usar um raio inventado). Por isso `PUT /company/address`
   passou a aceitar `lat`/`lng` opcionais — sem coordenadas cadastradas,
   `complete-return` nunca teria como validar proximidade.
5. Sem prova de entrega adicional (foto, confirmacao do cliente) nesta fase —
   decisao explicita do responsavel, aceitando o risco por ora. Fica marcado
   como debito tecnico de seguranca/fraude pra revisitar.
6. Corrigido de raspao um bug real em `cancel()`: antes, qualquer item
   `COMPLETED` no lote bloqueava cancelar os demais itens ainda ativos, pra
   sempre — inofensivo antes porque `COMPLETED` era inalcancavel, deixou de
   ser com esta feature. Agora `cancel()` ignora itens ja
   `CANCELLED`/`COMPLETED` e so falha se nao sobrar nada pra cancelar.

### Persistencia

- Migration aditiva `20260816195435_delivery_lifecycle_gps_deferred_pricing`:
  `Delivery.destinationKnownAtCreation` (novo, `NOT NULL DEFAULT true`);
  `Delivery.totalValue/driverValue/platformValue` deixam de ser obrigatorios;
  `DeliveryAddress.street/number/city/state/zip` deixam de ser obrigatorios;
  `PlatformSettings.returnProximityRadiusMeters` (novo, nullable). Tudo
  `DROP NOT NULL`/`ADD COLUMN` nullable — sem perda de dado, aplicada com
  `prisma migrate dev` direto no Postgres local (`docker-compose`).
- `Driver.lastKnownLat/lastKnownLng/lastSeenAt` continuam sem uso (nenhuma
  leitura/escrita em lugar nenhum) — nao foram usados aqui, sao um campo
  futuro separado.

## Historico de mudancas

### 2026-08-19 — Bloqueio/suspensao com efeito real (P1-03)

`setAccountStatus` so trocava o enum. Na pratica o motoboy suspenso ou bloqueado
seguia marcado como `AVAILABLE`, com o log de presenca aberto contando tempo
online, e as ofertas que ja estavam na mao dele ficavam paradas ate expirar
sozinhas — durante esse tempo o pedido nao ia para mais ninguem, mesmo havendo
motoboy livre. E o aceite nao olhava `accountStatus`: quem fosse bloqueado
segurando uma oferta ainda conseguia assumir o pedido.

O que passou a acontecer ao suspender/bloquear:

1. `availability` cai para `UNAVAILABLE` e o `DriverPresenceLog` aberto e
   fechado, na mesma transacao da troca de status (mesmo caminho de ficar
   offline);
2. as ofertas pendentes voltam para a fila via
   `DispatchService.releasePendingOffersForDriver()`, que reaproveita
   `handleOfferExpired` — ela ja trata lote, cancela o job de timeout, avisa o
   app e redespacha, entao nao existe um segundo fluxo para manter em acordo;
3. o app do motoboy recebe `driver:account-status-changed`, para nao continuar
   exibindo uma oferta que ja nao e dele.

Reativar devolve o direito de trabalhar, mas **nao** a disponibilidade: ficar
online e escolha do motoboy, e reativar sozinho o colocaria para receber pedido
sem ter pedido.

A guarda de aceite entrou em `DeliveryOffersService.findDriverForUser()`, ponto
unico de aceite e recusa; recusar tambem fica bloqueado, para o motoboy impedido
nao operar a fila de nenhum lado.

Sem mudanca de schema e sem migration. `AdminDriversModule` passou a importar
`DispatchModule` e `RealtimeModule`.

Arquivos: `apps/api/src/dispatch/dispatch.service.ts`,
`apps/api/src/delivery-offers/delivery-offers.service.ts` (+spec),
`apps/api/src/admin/drivers/admin-drivers.service.ts` (+spec e module).

Validacao: `npx tsc --noEmit` limpo; `npx jest --runInBand` 217/217;
`npx jest --config test/jest-e2e.json --runInBand` 126/126. Removendo a guarda
de aceite, os tres testes novos de conta impedida falham (conferido).

**Pendente:** nao ha cobertura e2e do bloqueio ponta a ponta (admin bloqueia →
oferta volta para a fila → aceite recusado). Os testes acima sao unitarios.

### 2026-08-19 — Preco por regiao da empresa (P1-06)

`PricingService.quote()` escolhia a praca sozinho, com
`region.findFirst({ active: true })` — a primeira regiao ativa numa ordem que o
Postgres nao garante. Com uma praca cadastrada isso acertava por acidente; na
segunda, uma empresa passaria a ser cobrada pela tabela de outra cidade,
silenciosamente e sem erro nenhum. `Company.regionId` ja existia, obrigatorio, e
era simplesmente ignorado.

Decisao: `regionId` virou parametro **obrigatorio** de `PricingQuoteInput`, e
nao opcional com fallback. Quem cota precisa dizer de qual praca esta falando;
assim nao sobra caminho de volta ao palpite e o compilador cobra isso em
qualquer chamada nova. A regiao informada e conferida (`id` + `active`): praca
desativada interrompe a cotacao com 409 proprio, em vez de cair para outra —
cair seria cobrar o cliente por uma tabela que nao e a dele. O erro anterior era
500 "nenhuma regiao configurada", que descrevia um problema de plataforma.

Os tres pontos de cotacao passaram a informar a praca da empresa dona do pedido:
criacao individual e em lote via `company.regionId` (que `findCompanyForUser`
passou a carregar), e `markDelivered` — onde o preco nasce na entrega, no modo
GPS — via `delivery.company.regionId`, incluido na consulta. Ali importa a praca
da EMPRESA, nao a de quem entrega: o motoboy pode atender fora da regiao dela.

Sem mudanca de schema e sem migration.

Arquivos: `apps/api/src/pricing/pricing.service.ts`,
`apps/api/src/pricing/pricing.service.spec.ts`,
`apps/api/src/deliveries/deliveries.service.ts`.

Validacao: `npx tsc --noEmit` limpo; `npx jest --runInBand` 211/211;
`npx jest --config test/jest-e2e.json --runInBand` 126/126. Revertendo a selecao
para a antiga, o teste novo falha (conferido).

### 2026-08-16 — Ciclo de entrega (backend) + destino capturado por GPS

Implementado o ciclo pos-aceite completo (item 7 da lista de prioridades) e a
opcao de pedido/lote sem endereco na criacao, com preco calculado
retroativamente a partir da localizacao do motoboy na entrega. So backend
nesta fase — decisao explicita do responsavel, dado que nao existe biblioteca
de GPS nem tela pos-aceite no driver-app hoje.

Arquivos principais:

- `apps/api/prisma/schema.prisma` e a migration
  `20260816195435_delivery_lifecycle_gps_deferred_pricing`;
- `apps/api/src/deliveries/deliveries.service.ts` (`collect`, `markDelivered`,
  `completeReturn`, fix em `cancel()`, `create`/`createBatch` com o novo
  ramo sem destino) e `.controller.ts`;
- `apps/api/src/dispatch/dispatch.service.ts` (payload de oferta com
  `driverValue`/`distanceKm` nulos quando o destino nao e conhecido —
  `Number(null)` seria silenciosamente `0`, nao `null`);
- `apps/api/src/common/haversine.ts` (novo);
- `apps/api/src/admin/platform-settings/` e
  `apps/api/src/company/company-address.*` (novos campos);
- contratos de `packages/validation` (`mark-delivered.schema.ts` e
  `complete-return.schema.ts`, novos; `create-delivery.schema.ts` e
  `update-platform-settings.schema.ts` e `upsert-company-address.schema.ts`,
  editados), `packages/types` e `packages/api-client`;
- `apps/api/test/delivery-lifecycle.e2e-spec.ts` (novo, 13 testes).

Consumidores de `@motoboycity/types` fora do backend foram checados e
corrigidos por causa da mudanca de `totalValue`/`driverValue`/`platformValue`
pra `number | null`: `apps/company-web` (lista de pedidos e mensagem de
sucesso da criacao) e `apps/admin-web` (lista de pedidos) mostram
"A calcular na entrega" quando nulo; `apps/driver-app`
(`IncomingOfferScreen`) mostra "A calcular" no lugar do valor da oferta.
Nenhuma dessas telas tem UI pra *criar* um pedido sem destino ainda — so
passaram a exibir corretamente o caso quando ele existir via API.

### 2026-08-13 — pedidos em lote

Implementado o contrato completo de lote solicitado apos a auditoria P0-01.

Arquivos principais alterados:

- `apps/api/prisma/schema.prisma`;
- `apps/api/prisma/migrations/20260813195000_add_delivery_batch/migration.sql`;
- `apps/api/src/deliveries/deliveries.controller.ts`;
- `apps/api/src/deliveries/deliveries.service.ts`;
- `apps/api/src/dispatch/dispatch.service.ts`;
- contratos de `packages/validation`, `packages/types` e `packages/api-client`;
- `apps/driver-app/src/screens/IncomingOfferScreen.tsx`;
- testes unitarios de deliveries e dispatch.

O app mobile apenas identifica visualmente a oferta como lote. Ainda nao ha
tela para criar lote no company-web nem visualizacao detalhada do grupo no app
ou admin-web.

### 2026-08-13 — P1-01: oferta pendente unica sob concorrencia

Implementada a primeira correcao do nucleo operacional de dispatch.

- Nova migration aditiva:
  `apps/api/prisma/migrations/20260813210000_enforce_one_pending_offer_per_delivery/migration.sql`.
  Ela falha antes de criar o indice se uma base existente tiver mais de uma
  oferta `PENDING` para a mesma entrega; esse e o impacto de dados que precisa
  ser verificado antes do deploy em staging.
- O indice parcial unico
  `delivery_offers_one_pending_per_delivery_key` garante no PostgreSQL que
  cada `deliveryId` tenha no maximo uma oferta `PENDING`.
- `DispatchService` passou a bloquear as entregas com `FOR UPDATE`, revalidar
  que todas seguem `AWAITING_DRIVER` e verificar oferta pendente dentro de
  transacao `Serializable` antes de inserir. Isto sincroniza dispatch com
  cancelamento e protege lotes como uma unica unidade.
- Corridas esperadas de banco (`P2002` por unicidade e `P2034` por serializacao)
  sao tratadas como resultado idempotente: nao ha job ou evento duplicado.
- Rollback manual da migration: remover apenas o indice parcial. O banco de
  teste foi descartado apos essa verificacao.

Arquivos principais:

- `apps/api/src/dispatch/dispatch.service.ts`;
- `apps/api/src/dispatch/dispatch.service.spec.ts`;
- `apps/api/prisma/migrations/20260813210000_enforce_one_pending_offer_per_delivery/migration.sql`.

### 2026-08-13 — P1-02: elegibilidade formal e backfill controlado de modalidades

Implementada a decisao de produto de atribuir modalidades explicitamente pelo
admin, sem habilitacao em massa dos entregadores existentes. Nao foi criada
migration: a relacao `DriverServiceType` ja existia no schema e passa a ser
usada pelo fluxo operacional.

- Novo contrato administrativo `PUT /admin/drivers/:id/service-types` com
  `{ serviceTypeIds: uuid[] }` (1 a 20 IDs unicos). Ele aceita apenas
  modalidades existentes e ativas e substitui os vinculos em uma transacao;
  o primeiro ID informado e marcado como `isPrimary`.
- `GET /admin/drivers` agora retorna as modalidades atribuidas. O
  `admin-web` permite selecionar e salvar as modalidades por entregador e
  identifica explicitamente quem ainda nao recebera ofertas.
- O dispatch exige que o entregador esteja na mesma `company.regionId`, tenha
  conta `APPROVED`/`ACTIVE`/`AVAILABLE`, possua **todas** as modalidades dos
  pedidos de um lote (e que elas ainda estejam ativas) e nao possua entrega em
  estado operacional `ACCEPTED`, `COLLECTED` ou `DELIVERED`.
- A consulta escolhe o candidato mais antigo online e a criacao revalida os
  mesmos criterios na transacao serializavel antes de inserir a oferta. Uma
  alteracao de conta, modalidade, regiao ou carga entre as duas leituras nao
  gera oferta.
- Entregadores antigos sem vinculos nao sao elegiveis ate que um admin os
  configure no painel. Isso e o backfill controlado; nao ha script que infira
  ou atribua capacidades automaticamente.

Arquivos principais:

- `packages/validation/src/admin/replace-driver-service-types.schema.ts`;
- `packages/types/src/driver.ts` e `packages/api-client/src/admin-drivers.ts`;
- `apps/api/src/admin/drivers/admin-drivers.controller.ts` e
  `apps/api/src/admin/drivers/admin-drivers.service.ts`;
- `apps/admin-web/src/app/(app)/entregadores/page.tsx`;
- `apps/api/src/dispatch/dispatch.service.ts` e os testes correspondentes.

### 2026-08-16 — E2E de lote/dispatch e correcoes de isolamento de teste

Implementado o item 2 da lista de prioridades (cobertura E2E do lote e do
dispatch sob concorrencia). No caminho, tres problemas reais e independentes
foram encontrados e corrigidos — nenhum deles introduzido por este trabalho,
todos pre-existentes e descobertos por serem bloqueadores diretos da tarefa:

1. **Postgres local (docker-compose) estava com schema desatualizado.** As
   duas migrations de 2026-08-13 (lote e indice unico de oferta pendente)
   nunca haviam sido aplicadas no banco de desenvolvimento local — só no Neon
   (ver secao de staging). Isso fazia `POST /deliveries` retornar 500 em
   qualquer E2E que tocasse `deliveries.batchId`. Aplicado
   `prisma migrate deploy` no Postgres local (`docker-compose.yml`,
   porta 5434); as 2 migrations pendentes foram aplicadas com sucesso.
2. **`delivery-offers.e2e-spec.ts` estava quebrado pela elegibilidade P1-02.**
   O motoboy de teste nunca recebia `DriverServiceType`, entao nenhuma oferta
   era criada e 3 dos 8 testes falhavam. Corrigido adicionando a chamada
   `PUT /admin/drivers/:id/service-types` no `beforeAll`. Isso expos um
   segundo problema: os testes de aceite bem-sucedido nunca liberavam o
   motoboy depois (uma entrega `ACCEPTED` torna o motoboy inelegivel sob
   P1-02), travando os testes seguintes que dependiam dele — corrigido com um
   cancelamento por admin apos cada aceite bem-sucedido. Tambem corrigida a
   ordem de limpeza do `afterAll` (excluir `DriverServiceType` antes de
   `ServiceType`, por causa da FK).
3. **Suites de E2E rodando em paralelo corrompiam o estado umas das outras.**
   `jest --config ./test/jest-e2e.json` sem `--runInBand` roda arquivos de
   teste em workers paralelos; como `DispatchService` usa checagens globais
   (ex.: "algum motoboy com oferta pendente em qualquer lugar do banco" em
   `findNextEligibleDriverId`), dois arquivos de teste manipulando motoboys
   reais ao mesmo tempo contra o mesmo Postgres/Redis produziam falhas
   nao-deterministicas (motoboy errado recebendo a oferta, oferta
   inexistente). Corrigido adicionando `--runInBand` ao script `test:e2e` em
   `apps/api/package.json` — suite inteira roda serial agora. Validado: 16
   suites / 110 testes passando de forma repetida com essa flag; sem ela, o
   mesmo lote de arquivos falhava de forma intermitente.

Arquivos principais:

- `apps/api/test/delivery-batch-dispatch.e2e-spec.ts` (novo);
- `apps/api/test/delivery-offers.e2e-spec.ts` (corrigido);
- `apps/api/package.json` (`test:e2e` com `--runInBand`).

Cada teste de lote que nao leva a entrega a um estado terminal (`ACCEPTED`
por aceite de verdade) fecha o lote via cancelamento por admin no fim —
necessario porque `driver-presence.service` chama
`dispatchService.dispatchAvailableDeliveries()` sempre que um motoboy fica
disponivel, varrendo TODAS as entregas `AWAITING_DRIVER` do banco; um lote
orfao de um teste anterior pode ser redespachado pro motoboy do teste
seguinte de forma inesperada.

## Validacoes mais recentes

Executadas em 2026-08-13, apos a implementacao de lote:

| Comando                                                                             | Resultado                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm --filter @motoboycity/api exec prisma validate --schema prisma/schema.prisma` | aprovado                                 |
| `pnpm typecheck`                                                                    | aprovado nos 8 workspaces (P1-02)        |
| `pnpm --filter @motoboycity/api test -- --runInBand`                                | 17 suites, 186 testes aprovados (P1-02)  |
| testes focados de drivers + dispatch                                                | 2 suites, 51 testes aprovados (P1-02)    |
| `pnpm --filter @motoboycity/api lint`                                               | aprovado (P1-02)                         |
| `pnpm --filter @motoboycity/admin-web lint`                                         | aprovado (P1-02)                         |
| Prettier nos arquivos alterados e `git diff --check`                                | aprovados (P1-02)                        |
| `pnpm --filter @motoboycity/driver-app lint`                                        | aprovado com 74 warnings preexistentes   |
| `git diff --check`                                                                  | aprovado                                 |
| `prisma migrate deploy` em PostgreSQL temporario vazio                              | 7 migrations aplicadas com sucesso       |
| `prisma migrate status` no banco temporario                                         | schema atualizado                        |
| rollback manual da migration no banco temporario                                    | indice e coluna removidos com sucesso    |
| `prisma migrate deploy` em PostgreSQL temporario vazio (P1-01)                      | 8 migrations aplicadas com sucesso       |
| duas insercoes `PENDING` concorrentes para a mesma entrega (P1-01)                  | uma confirmada, outra rejeitada; total 1 |
| rollback manual da migration P1-01 no banco temporario                              | indice parcial removido com sucesso      |
| `prisma migrate status` no Neon Postgres (staging, 2026-08-16)                      | banco vazio, 0/8 migrations aplicadas    |
| `prisma migrate deploy` no Neon Postgres (staging, 2026-08-16)                      | 8/8 migrations aplicadas com sucesso     |
| `prisma migrate status` no Neon apos o deploy (2026-08-16)                          | "Database schema is up to date!"         |
| `prisma migrate deploy` no Postgres local `docker-compose` (2026-08-16)             | 2 migrations pendentes aplicadas         |
| `pnpm --filter @motoboycity/api exec jest --config test/jest-e2e.json --runInBand` (2026-08-16) | 16 suites, 110 testes aprovados |
| mesmo comando sem `--runInBand` (2026-08-16)                                        | 3 falhas intermitentes por corrida entre arquivos |
| `pnpm --filter @motoboycity/api exec eslint test/delivery-batch-dispatch.e2e-spec.ts test/delivery-offers.e2e-spec.ts` | aprovado |
| `pnpm --filter @motoboycity/api exec tsc --noEmit` (2026-08-16)                     | aprovado                                 |
| `prisma migrate dev` (ciclo de entrega, 2026-08-16)                                 | migration aditiva aplicada no Postgres local |
| `pnpm --filter @motoboycity/api exec jest --runInBand` (ciclo de entrega, 2026-08-16) | 18 suites, 210 testes aprovados         |
| `pnpm --filter @motoboycity/api exec jest --config test/jest-e2e.json --runInBand` (ciclo de entrega, 2026-08-16) | 17 suites, 126 testes aprovados |
| `pnpm typecheck` (raiz, 8 workspaces, ciclo de entrega, 2026-08-16)                  | aprovado                                 |
| `pnpm lint` (raiz, 8 workspaces, ciclo de entrega, 2026-08-16)                       | aprovado (driver-app com 74 warnings preexistentes) |

Nao foram executados:

- backup/restore/anonimizacao antes do deploy no Neon — dispensado porque o
  banco estava genuinamente vazio (0/8 migrations, confirmado por
  `migrate status` antes de aplicar), nao uma copia com dado real a proteger;
- consulta de preflight de ofertas `PENDING` duplicadas no Neon — dispensada
  pelo mesmo motivo (banco vazio, sem oferta nenhuma pra colidir);
- E2E da API contra o Neon;
- build de producao ou build Android.

A migration foi exercitada primeiro em um PostgreSQL 17 temporario (vazio e
descartado, sem tocar no banco de desenvolvimento) e depois aplicada de fato
no Neon Postgres reservado para staging/producao (`NEON_DATABASE_URL_FUTURE`
em `apps/api/.env`, ainda comentado por padrao — usar via override de
`DATABASE_URL` na hora do comando, nao editar `.env` para nao repontar o dev
local). O Neon agora tem o schema completo aplicado e pode servir como
staging real daqui pra frente. `DATABASE_URL` do dev local nao foi alterado.

## Limitacoes e proximos passos priorizados

1. ~~Validar as migrations em copia de staging~~ — feito em 2026-08-16: Neon
   estava vazio, migrations aplicadas direto (ver Validacoes). Meta original
   (backup/restore/anonimizacao) nao se aplicava por nao haver dado real
   ainda. Se o Neon acumular dado real no futuro, qualquer proxima migration
   volta a exigir esse processo completo.
2. ~~Cobertura E2E/realtime do lote e do dispatch.~~ — feito em 2026-08-16:
   novo `apps/api/test/delivery-batch-dispatch.e2e-spec.ts` cobre criacao por
   endpoint, duas chamadas simultaneas a `dispatchDelivery`, aceite vs.
   cancelamento simultaneos, aceite vs. expiracao simultaneos, recusa em lote
   com redespacho, e aceite de lote via HTTP. Realtime e verificado via
   `RealtimeGateway` mockado (spies em `emitToDriver`/`emitAdminActivity`),
   nao um cliente Socket.IO real — decisao deliberada para evitar depender de
   `socket.io-client` (ausente do projeto) e de timing de rede; ver Historico
   de mudancas para o motivo completo.
3. **Operar o backfill controlado de modalidades.** Antes de esperar ofertas
   para entregadores existentes, o admin deve atribuir pelo menos uma
   modalidade ativa a cada perfil apto. A mudanca nao requer migration nem
   habilita capacidades automaticamente. O vinculo ainda nao registra quem o
   alterou nem quando; se auditoria administrativa for requisito, adicionar
   esses campos por migration aditiva antes de depender deles em suporte.
4. ~~Bloqueio/suspensao (P1-03).~~ — feito em 2026-08-19: retira
   disponibilidade e fecha a presenca, devolve as ofertas pendentes para a fila,
   impede aceite/recusa e emite `driver:account-status-changed`. Ver Historico
   de mudancas. **Falta** cobertura e2e ponta a ponta desse fluxo.
5. **Presenca multi-sessao (P1-04)** e **timeout configuravel no contrato
   admin (P1-05)** continuam pendentes de confirmacao/validacao ponta a ponta.
6. ~~Preco regional (P1-06).~~ — feito em 2026-08-19: `PricingService.quote()`
   passou a exigir `regionId` (parametro obrigatorio, sem fallback) e os tres
   pontos de cotacao informam a praca da empresa dona do pedido. Ver Historico
   de mudancas.
7. ~~Ciclo de entrega (Fase 2) — backend.~~ — feito em 2026-08-16: maquina de
   estados `ACCEPTED → COLLECTED → DELIVERED → COMPLETED` implementada, com
   destino capturado por GPS na entrega como modo opcional por pedido/lote.
   Ver "Contrato do ciclo de entrega" e Historico de mudancas. **Ainda
   pendente**: telas do driver-app (nenhuma existe hoje — nem biblioteca de
   GPS, nem tela pos-aceite) e o seletor "com/sem destino" no formulario de
   criacao do company-web (que hoje so cria pedido com endereco). Financeiro/
   credito em carteira tambem nao foi tocado — COMPLETED e so um status
   terminal por enquanto, sem nenhum movimento de dinheiro associado.
8. **Clientes.** Criar a tela de lote no company-web, o seletor de destino
   conhecido/desconhecido, e a tela de ciclo de entrega no driver-app
   (coletar / marcar entregue com GPS / fechar retorno). Trocar mocks apenas
   quando as respectivas APIs existirem e forem testadas.
9. **Release.** Criar CI, corrigir README/arquitetura operacional, configurar
   staging, backup/restore, logs e rollback.

## Estado do worktree

As mudancas de lote, a nova cobertura E2E, as correcoes de teste, o ciclo de
entrega/GPS descritos acima e este handoff ainda estao sem commit. Ha tambem
arquivos locais nao rastreados (`.agents/`, `.codex/` e `AGENTS.md`) que nao
devem ser removidos ou incluidos em commit sem decisao explicita do
responsavel.

O Postgres local do `docker-compose` agora tem as 8 migrations aplicadas
(igual ao Neon); nao esta mais atrasado em relacao ao `schema.prisma`.

## Ambiente de staging (Neon)

Desde 2026-08-16 o Neon Postgres reservado (`NEON_DATABASE_URL_FUTURE` em
`apps/api/.env`) tem o schema completo aplicado (8/8 migrations) e pode ser
usado como staging real. Continua comentado no `.env` de proposito — o dev
local segue no Postgres do `docker-compose.yml`. Para rodar qualquer comando
Prisma contra o Neon, use override de `DATABASE_URL` na propria chamada em
vez de editar o `.env` compartilhado.
