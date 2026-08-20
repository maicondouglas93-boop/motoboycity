# Guia de trabalho para agentes de IA — MOTOboyCity

> Este projeto é trabalhado por mais de um agente de IA, em sessões
> diferentes, ao longo do tempo. Este guia existe pra que todos sigam o
> mesmo caminho, em vez de cada sessão redescobrir (ou contradizer) o que a
> anterior já aprendeu. Leia isto de ponta a ponta antes de tocar em código
> pela primeira vez neste repositório; releia se algo aqui contradizer o que
> você está prestes a fazer.

## Antes de qualquer coisa, nesta ordem

1. **`AGENTS.md`** (raiz do repo) — regras rígidas, o que nunca fazer. Curto
   de propósito, leia inteiro.
2. **`docs/agent-handoff.md`** — estado atual: o que já está implementado, o
   que está pendente, decisões recentes, comandos já validados. É o
   documento que mais muda; trate como mais atual que qualquer memória sua
   de sessões anteriores.
3. **`docs/business-rules.md`** — decisões de negócio confirmadas
   (comissão, cancelamento, lote, retorno, etc.). Muda raramente. Não
   redescubra nem re-questione o que está lá.
4. `git status` e `git log --oneline -10` — pra saber o que já está
   commitado vs. o que está solto no worktree (ver seção Git abaixo; neste
   projeto é comum haver trabalho de fases inteiras sem commit ainda).

## Como esta base de código é organizada

Monorepo PNPM/Turborepo: `apps/api` (NestJS + Prisma/PostgreSQL +
Redis/BullMQ + Socket.IO), `apps/company-web` e `apps/admin-web` (Next.js),
`apps/driver-app` (React Native). Contratos compartilhados em
`packages/types`, `packages/validation` (Zod) e `packages/api-client`.

A cadeia de contrato de qualquer endpoint é sempre a mesma, nessa ordem:

```
packages/validation (schema Zod)
  → packages/types (tipo inferido do schema, re-exportado)
    → packages/api-client (método HTTP tipado)
      → apps/api/src/**/*.controller.ts (ZodValidationPipe)
        → apps/api/src/**/*.service.ts (lógica)
```

Mudar qualquer elo dessa cadeia sem os outros normalmente **não quebra o
build imediatamente** — quebra em runtime, ou silenciosamente (um campo que
deveria existir some, um `null` novo vira `NaN` numa tela). Ao mudar um
contrato, ande a cadeia inteira e rode `pnpm typecheck`/`pnpm lint` **na
raiz do monorepo**, não só no workspace que você editou (ver Armadilha #4).

## Fluxo de trabalho recomendado

1. **Investigue antes de escrever código.** Leia os arquivos de verdade, não
   assuma pelo nome de uma função ou pela presença de um valor de enum. Um
   enum `DeliveryStatus` pode ter `COLLECTED`/`DELIVERED`/`COMPLETED`
   definidos há semanas sem nenhum endpoint jamais ter usado esses valores —
   só se descobre isso lendo/`grep`ando o controller de verdade.
2. **Para qualquer tarefa não-trivial** (mais de ~3 arquivos, decisão de
   arquitetura, ambiguidade real de requisito), monte um plano concreto
   *antes* de editar, e pergunte ao usuário os pontos de decisão que
   genuinamente estão em aberto — não assuma. Planejar com cuidado
   costuma revelar bugs reais adjacentes à tarefa (não hipotéticos) antes
   de você escrever uma linha; vale o tempo.
3. **Uma fase por vez.** Não acumule três fases diferentes sem testar cada
   uma antes de seguir pra próxima — regra explícita do responsável do
   produto, não só boa prática genérica.
4. **Mudança de schema Prisma**: rode `prisma migrate dev` (deixa o Prisma
   gerar o arquivo da migration; nunca escreva a migration à mão). Migrations
   devem ser aditivas (`ADD COLUMN` nullable, `DROP NOT NULL`) sempre que
   possível. Nunca rode `migrate deploy`/`migrate dev` contra um banco
   compartilhado (Neon/staging) sem antes apresentar o impacto e ter
   autorização explícita — isso vale mesmo pra migration aditiva.
5. **Teste antes de reportar como pronto**:
   ```sh
   pnpm --filter @motoboycity/api test -- --runInBand
   pnpm --filter @motoboycity/api test:e2e
   pnpm typecheck   # na raiz — roda os 8 workspaces via Turborepo
   pnpm lint        # idem
   ```
6. **Atualize `docs/agent-handoff.md`** — sempre, mesmo em mudança pequena
   (regra 10 do `AGENTS.md`). Registre: decisão tomada, arquivos afetados,
   comandos executados e resultado, limitações conhecidas, próximo passo
   concreto.
7. **Não commite sem pedido explícito** (ver Git abaixo). Quando pedido,
   veja a Armadilha #5 antes de simplesmente rodar `git add -A`.

## Protocolo mínimo obrigatório: schema e lógica de dispatch

Estas são as duas áreas onde um erro custa dinheiro real ou corrompe dado
silenciosamente (sem falha de compilação, sem exceção). Trate cada item
abaixo como um portão obrigatório, não como sugestão — vale pra qualquer
modelo, independente de quão capaz ele se considere.

### Antes de tocar em `apps/api/prisma/schema.prisma`

1. Rode `pnpm --filter @motoboycity/api exec prisma validate` antes de
   editar, pra confirmar que você está partindo de um schema já válido.
2. Pergunte-se: a mudança é **aditiva** (campo novo opcional/nullable, model
   novo, `ADD COLUMN`) ou **destrutiva** (remover/renomear coluna, apertar
   um `NOT NULL` existente, mudar tipo de forma incompatível, dropar um
   model)? Se for destrutiva, **PARE** — apresente o impacto (quantas
   linhas afetadas, quem lê esse campo hoje) e peça autorização explícita
   antes de gerar a migration. Nunca assuma que "ninguém está usando isso
   ainda" sem checar de verdade.
3. Gere a migration com `prisma migrate dev --name <nome-descritivo>` —
   nunca escreva o arquivo `.sql` à mão.
4. **Leia o arquivo `.sql` gerado antes de seguir.** Confirme que ele
   realmente é só `ADD COLUMN`/`DROP NOT NULL`/`CREATE INDEX` — o Prisma às
   vezes infere uma migration mais agressiva do que o esperado (ex.:
   recriar uma tabela) dependendo da mudança.
5. Aplique só contra o Postgres local (`docker-compose.yml` — confira
   `DATABASE_URL` no `.env` antes de rodar qualquer comando Prisma). Nunca
   aponte pro Neon/staging sem pedido explícito pra essa ação específica,
   mesmo que a migration pareça inofensiva.
6. Se o campo mudado é lido por algum schema Zod em `packages/validation`
   ou tipo em `packages/types`, atualize os dois e rode
   `pnpm --filter @motoboycity/validation build` (Armadilha #1) antes de
   seguir.
7. `grep` o nome do campo/model em `apps/company-web/src`,
   `apps/admin-web/src` e `apps/driver-app/src` antes de considerar a
   tarefa terminada — mesmo numa tarefa "só backend", um campo que virou
   nullable pode quebrar uma tela que ninguém pediu pra você tocar
   (Armadilha #4).

### Antes de tocar em `apps/api/src/dispatch/`, `apps/api/src/deliveries/` ou `apps/api/src/delivery-offers/`

1. Identifique explicitamente, antes de editar: quais `DeliveryStatus`
   estão envolvidos na transição; se a ação é atômica pro lote inteiro
   (como `collect`/`cancel`) ou por item (como `deliver`/`acceptOffer`); e
   se outro ator pode disputar a mesma transição ao mesmo tempo (motoboy
   vs. motoboy, motoboy vs. empresa, motoboy vs. expiração automática).
2. Toda transição de status precisa gravar uma entrada em
   `DeliveryStatusHistory` (`fromStatus`/`toStatus`/`changedByUserId`) — é
   a fonte de auditoria do sistema, não é opcional só porque parece
   redundante com o campo `status` denormalizado em `Delivery`.
3. Se a mudança cria uma nova `DeliveryOffer`, ela precisa passar pelo
   mesmo padrão de `createPendingOffers()` em `dispatch.service.ts`: lock
   de linha (`FOR UPDATE`) + transação `Serializable` + tratamento de
   `P2002`/`P2034` como no-op idempotente. **Não remova nem enfraqueça esse
   padrão** pra "simplificar" — é a única proteção real contra duas ofertas
   concorrentes pro mesmo pedido (P1-01).
4. Se a mudança toca elegibilidade (`eligibleDriverWhere()`), teste
   explicitamente as condições que ela já verifica hoje (região,
   `approvalStatus`, `accountStatus`, `availability`, modalidade de
   serviço atribuída) mais a exclusão por `ASSIGNMENT_BLOCKING_STATUSES` —
   uma mudança que "esquece" uma delas deixa motoboy ocupado recebendo
   oferta nova, ou motoboy elegível nunca recebendo nada, e nenhum dos dois
   erra em compilação.
5. Todo valor monetário (`totalValue`, `driverValue`, `platformValue`,
   `returnValue`) precisa passar por `PricingService.quote()` — nunca
   calcule ou copie um valor de comissão/preço direto no meio de um método
   de dispatch/entrega.
6. Escreva (ou estenda) um teste E2E de concorrência real pra qualquer
   ação nova que dois atores possam disparar ao mesmo tempo —
   `Promise.allSettled([...])` disparando as duas ações reais via
   `supertest`, não só um teste unitário com mock. Ver
   `apps/api/test/delivery-batch-dispatch.e2e-spec.ts` (aceite vs.
   cancelamento, aceite vs. expiração) como modelo.

### Gatilhos de PARE e PERGUNTE

Independente de quão confiante você esteja, pare e pergunte ao usuário
antes de prosseguir se qualquer um destes for verdade:

- A mudança de schema não é aditiva (remove, renomeia, ou aperta uma
  constraint existente).
- Você está prestes a rodar qualquer comando Prisma (`migrate deploy`,
  `migrate dev`, `db push`) contra um banco que não seja o Postgres local
  do `docker-compose.yml`.
- Você está prestes a rodar `DELETE`/`deleteMany`/`TRUNCATE` sem filtro
  escopado, em qualquer ambiente.
- A tarefa exige uma decisão de regra de negócio que não está em
  `docs/business-rules.md` nem foi dita explicitamente nesta conversa
  (ex.: valor exato de comissão, se uma ação deve ser tudo-ou-nada vs.
  parcial, quem pode executar uma ação nova).
- Você percebeu um bug real e não-relacionado à tarefa atual, mas que
  bloqueia a tarefa (ex.: o bug do `cancel()` travando o lote inteiro com
  um item já `COMPLETED`, encontrado numa sessão anterior) — não silencie
  nem contorne por conta própria; avise e pergunte se corrige agora.
- Você está prestes a fazer commit/push/abrir PR sem o usuário ter pedido
  isso **nesta mensagem**, especificamente — um pedido anterior na
  conversa não vale pra sempre.

## Armadilhas conhecidas

Descobertas com custo real de tempo em sessões anteriores — evite repetir.

### #1 — `packages/validation` precisa de build manual depois de editar

Diferente de `packages/types` e `packages/api-client` (que apontam direto
pro `src/*.ts` via `"main": "./src/index.ts"`), `packages/validation`
compila pra `dist/` (`"main": "./dist/index.js"`). Depois de editar
qualquer schema em `packages/validation/src`, rode:

```sh
pnpm --filter @motoboycity/validation build
```

antes de typecheckar `apps/api` ou qualquer outro consumidor — senão o TS
consumidor enxerga a versão `dist/` **antiga**, e os erros que aparecem (ou
que deveriam aparecer e não aparecem) apontam pro lugar errado.

### #2 — testes E2E precisam rodar em série (`--runInBand`)

`DispatchService` tem checagens de elegibilidade **globais**, não escopadas
por arquivo de teste (ex.: "existe algum motoboy com oferta `PENDING` em
qualquer lugar do banco" em `findNextEligibleDriverId`). Rodar múltiplos
arquivos de teste em paralelo (comportamento padrão do Jest) contra o
**mesmo** Postgres/Redis reais produz corrida entre arquivos — motoboy
errado recebendo oferta, falhas não-determinísticas. `apps/api/package.json`
já tem `"test:e2e": "jest --config ./test/jest-e2e.json --runInBand"` — não
remova essa flag pra "acelerar"; sem ela a suíte volta a falhar de forma
intermitente (confirmado empiricamente: mesma suíte, com e sem a flag).

### #3 — presença de motoboy dispara uma varredura global

`PUT /driver/presence` pra `AVAILABLE` chama
`dispatchService.dispatchAvailableDeliveries()` por baixo, que varre
**todas** as entregas `AWAITING_DRIVER` do banco — não só as do teste atual.
Se um teste E2E cria uma entrega/lote e não leva ela a um estado terminal
(`CANCELLED`/`COMPLETED`) antes de acabar, ela fica órfã e pode ser
despachada pro motoboy do **próximo** teste de forma inesperada, quebrando
uma asserção que parece não ter nada a ver com o teste que falhou. Sempre
feche toda entrega criada num teste antes dele terminar — veja o padrão
`releaseAllDeliveries()` em `apps/api/test/delivery-batch-dispatch.e2e-spec.ts`
e `apps/api/test/delivery-lifecycle.e2e-spec.ts`.

### #4 — `typecheck`/`lint` precisam rodar na raiz, não só no workspace editado

Editar um tipo compartilhado em `packages/types` pode quebrar
`apps/company-web`, `apps/admin-web` ou `apps/driver-app` mesmo que você não
tenha tocado nenhum arquivo desses apps — o erro só aparece rodando
`pnpm typecheck`/`pnpm lint` **na raiz** (roda todos os workspaces via
Turborepo), não `pnpm --filter @motoboycity/api typecheck` isolado.
Confirmado: mudar `totalValue`/`driverValue` de `number` pra `number | null`
quebrou 3 telas em 2 apps diferentes que ninguém tinha tocado na mesma
tarefa. `AGENTS.md` regra 1 ("localize os consumidores antes de alterar um
contrato") existe exatamente por causa disso — leve a sério, não é
formalidade.

### #5 — commits acumulados de várias fases ficam impossíveis de separar depois

Este projeto tem uma regra dupla: nunca commitar sem pedido explícito, e
nunca fazer um commit gigante único quando for commitar. O problema: se
**várias fases diferentes** ficam sem commit ao mesmo tempo tocando os
**mesmos arquivos** (`schema.prisma`, `deliveries.service.ts`,
`dispatch.service.ts` são tocados por quase toda mudança de negócio nesse
domínio), fica **literalmente impossível** separá-las depois por commit sem
staging interativo por trecho (`git add -p`) — e isso não funciona em
ambientes de execução não-interativos (trava esperando input que nunca
chega).

**Recomendação prática**: ao terminar uma fase/feature coerente, considere
perguntar ao usuário se ele quer commitar aquela fase antes de você começar
a próxima. Isso pode parecer contra a instrução de "não interromper", mas o
custo de perguntar nesse momento é muito menor que o custo de reconstruir a
separação (ou desistir dela) depois que três fases diferentes já estão
fundidas no mesmo diff não commitado.

## Convenção de teste E2E

Os arquivos mais completos como referência:
`apps/api/test/delivery-lifecycle.e2e-spec.ts` e
`apps/api/test/delivery-batch-dispatch.e2e-spec.ts`. Padrão:

- `Test.createTestingModule({ imports: [AppModule] })` com o `AppModule`
  real — não um módulo reduzido. Só `GoogleMapsService` (evita depender de
  rede/API key real) e `RealtimeGateway` (vira spy pra inspecionar eventos
  emitidos, sem precisar de um cliente Socket.IO de verdade) costumam ser
  sobrescritos via `.overrideProvider(...)`.
- Fluxos reais de HTTP via `supertest` — registro, aprovação por admin,
  login — não inserção direta no banco pra montar o cenário (exceto quando
  não existe endpoint pra aquele dado ainda, ex.: coordenadas de endereço
  antes de `PUT /company/address` aceitar lat/lng).
- Fixtures com sufixo único (`Date.now()`) em e-mail/documento/CPF/código de
  tipo de serviço, pra rodar em paralelo com outros arquivos sem colisão de
  dado (mas ainda assim precisa de `--runInBand` por causa da Armadilha #2 —
  sufixo único evita colisão de *dado*, não de *comportamento global* do
  dispatch).
- `afterAll` faz limpeza **escopada** (por `serviceTypeId`/e-mail/documento
  do próprio teste) — nunca um `deleteMany({})` sem filtro.
- Toda entrega criada precisa terminar em estado terminal antes do teste
  acabar (Armadilha #3).

## Onde encontrar o quê

| Preciso saber... | Leia |
|---|---|
| O que nunca fazer | `AGENTS.md` |
| O que já está implementado, o que falta, decisões recentes | `docs/agent-handoff.md` |
| Regras de negócio confirmadas (comissão, cancelamento, lote, retorno...) | `docs/business-rules.md` |
| Como escrever um teste E2E novo | `apps/api/test/delivery-lifecycle.e2e-spec.ts` como modelo |
| Padrão de transição atômica de status em lote | `DeliveriesService.collect()`/`.cancel()` em `apps/api/src/deliveries/deliveries.service.ts` |
| Checklist obrigatório antes de mexer em schema ou dispatch | "Protocolo mínimo obrigatório" neste guia |
