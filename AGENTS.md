# MOTOboyCity

> Este projeto e trabalhado por mais de um agente de IA, em sessoes
> diferentes. Antes de qualquer alteracao, leia tambem
> `docs/ai-agent-guide.md` (fluxo de trabalho, armadilhas conhecidas) e
> `docs/business-rules.md` (decisoes de negocio confirmadas), alem deste
> arquivo e de `docs/agent-handoff.md`.

## Visao geral

Monorepo PNPM/Turborepo de uma plataforma B2B de entregas. Inclui a API NestJS, os paineis `company-web` e `admin-web` em Next.js e o `driver-app` em React Native CLI.

## Arquitetura confirmada

- `apps/api`: NestJS, Prisma/PostgreSQL, Redis/BullMQ, Socket.IO, JWT e Google Maps Routes API.
- `apps/company-web` e `apps/admin-web`: Next.js, TanStack Query e `@motoboycity/api-client`.
- `apps/driver-app`: React Native, React Navigation, Zustand, AsyncStorage e Socket.IO.
- `packages/types`, `packages/validation` e `packages/api-client`: contratos compartilhados.

## Comandos

```sh
pnpm typecheck
pnpm lint
pnpm --filter @motoboycity/api exec jest --runInBand
pnpm --filter @motoboycity/api test:e2e
pnpm --filter @motoboycity/api run build
pnpm --filter @motoboycity/company-web run build
pnpm --filter @motoboycity/admin-web run build
pnpm --filter @motoboycity/driver-app exec jest --runInBand
```

Execute E2E somente com PostgreSQL e Redis isolados e configurados. Nao execute migrations, seed, Docker Compose ou builds nativos sem a solicitacao exigir isso.

## Regras de trabalho

1. Localize os consumidores antes de alterar um contrato em `packages/*`, uma rota ou um schema Zod.
2. Faça a menor alteracao que resolva a solicitacao; nao refatore codigo adjacente sem necessidade demonstravel.
3. O usuario decidiu manter pedidos em lote. Preserve o contrato descrito em `docs/agent-handoff.md`; a migration aditiva foi validada em banco vazio, mas ainda precisa de backup/restore e validacao em copia de staging antes de qualquer aplicacao compartilhada.
4. Nao altere migrations ja aplicadas. Para schema Prisma, avalie dados, crie migration aditiva e valide rollback antes de aplicar em qualquer ambiente compartilhado.
5. Nao exponha ou edite `.env`, secrets, `JWT_SECRET` ou `GOOGLE_MAPS_API_KEY` sem autorizacao explicita.
6. Nao altere contratos de API sem atualizar validacao, service/controller, `api-client`, `types`, clientes e testes no mesmo recorte.
7. Para dispatch, mantenha operacoes idempotentes e proteja transicoes concorrentes com operacoes condicionais/transacoes.
8. Nao trate telas que usam `mock-data` como funcionalidade integrada sem confirmar API e fluxo correspondente.
9. Depois de cada alteracao, execute a menor validacao relevante e informe arquivos modificados, testes e resultados.
10. Atualize `docs/agent-handoff.md` em toda alteracao funcional, de contrato, infraestrutura ou validacao. Registre decisao, estado atual, limitacoes, arquivos afetados, comandos executados e proximo passo concreto. O documento e a fonte de continuidade para agentes e colaboradores; nao registre secrets ou conteudo de `.env`.

## Areas criticas

- `apps/api/prisma/schema.prisma` e `apps/api/prisma/migrations/`
- `apps/api/src/auth/`, `deliveries/`, `dispatch/`, `delivery-offers/`, `pricing/`, `realtime/`
- `packages/validation/`, `packages/types/`, `packages/api-client/`
- sessoes dos tres clientes e configuracao de URL da API do mobile

## Uso de Skills e subagentes

- Use a Skill de entrega para pedido, preco, dispatch, oferta ou transicao de status.
- Use a Skill Prisma/contratos para banco, migrations, Zod ou pacotes compartilhados.
- Use as Skills web ou mobile para alteracoes especificas de cada cliente.
- Use a Skill de verificacao para auditoria, regressao, seguranca ou plano de testes.
- O coordenador deve solicitar subagentes somente para analises independentes. Subagentes configurados neste repositorio sao somente leitura; o coordenador executa as escritas depois de consolidar os resultados.
- Nao delegue em paralelo tarefas que possam tocar o mesmo schema, contrato ou fluxo de dispatch.

## Git

- Preserve alteracoes nao relacionadas no worktree.
- Revise `git diff` antes de concluir; nao use reset, checkout destrutivo ou exclusoes amplas.
- Nao faca commit, push ou abra PR sem pedido expresso.
