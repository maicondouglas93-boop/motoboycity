# MOTOboyCity

Plataforma B2B de entregas para empresas.

> **Status: Fase 0 — Fundação técnica.** Este repositório contém apenas a
> infraestrutura do monorepo (aplicações, build, lint, banco, filas,
> realtime). Nenhuma regra de negócio, entidade, autenticação ou fluxo de
> entrega foi implementada ainda — isso acontece na Fase 1.

## Arquitetura

O sistema é composto por três clientes e um backend central:

```
Company Web (Next.js) ──┐
                         │
Admin Web (Next.js)  ────┼──► API (NestJS) ──► PostgreSQL (Prisma)
                         │         │
Driver App (React       │         ├──► Redis (cache / BullMQ)
Native, bare) ───────────┘         └──► Socket.IO (realtime)
```

- **Company Web** e **Admin Web** consomem a API via HTTP (TanStack Query).
- **Driver App** consumirá a API via HTTP e, futuramente, eventos realtime
  (Socket.IO) e push notifications (FCM) — infraestrutura ainda não
  implementada nesta fase.
- **API** centraliza toda a lógica de negócio (a partir da Fase 1), persiste
  dados no PostgreSQL via Prisma, usa Redis/BullMQ para filas assíncronas e
  Socket.IO para comunicação em tempo real.

## Estrutura de pastas

```
motoboycity/
├── apps/
│   ├── company-web/     Painel Web da Empresa (Next.js)
│   ├── admin-web/       Painel Web Administrativo (Next.js)
│   ├── driver-app/      App Mobile do Motoboy (React Native CLI / bare)
│   └── api/              API central (NestJS)
├── packages/
│   ├── types/            Tipos TypeScript compartilhados
│   ├── validation/       Schemas/utilitários de validação compartilhados
│   ├── api-client/       Cliente HTTP tipado compartilhado
│   └── config/           TypeScript, ESLint e Prettier compartilhados
├── docker-compose.yml    PostgreSQL + Redis (desenvolvimento)
├── turbo.json             Orquestração das tasks (Turborepo)
├── pnpm-workspace.yaml
└── .env.example
```

## Stack (versões efetivamente instaladas)

| Camada                  | Tecnologia                | Versão  |
| ----------------------- | ------------------------- | ------- |
| Monorepo                | pnpm                      | 11.20.0 |
| Monorepo                | Turborepo                 | 2.10.8  |
| Linguagem               | TypeScript                | 5.9.3   |
| Company Web / Admin Web | Next.js                   | 16.3.0  |
| Company Web / Admin Web | React                     | 19.2.8  |
| Company Web / Admin Web | Tailwind CSS              | 4.x     |
| Company Web / Admin Web | shadcn/ui (Base UI)       | 4.16.x  |
| Company Web / Admin Web | TanStack Query            | 5.65.x  |
| Driver App              | React Native (CLI / bare) | 0.86.2  |
| Driver App              | React                     | 19.2.3  |
| API                     | NestJS                    | 11.x    |
| API                     | Prisma                    | 6.19.3  |
| API                     | BullMQ                    | 5.81.x  |
| API                     | ioredis                   | 5.11.x  |
| API                     | Socket.IO                 | 4.8.x   |

## Pré-requisitos

- **Node.js** ≥ 20 (testado com v22.18.0)
- **pnpm** — habilite via `corepack enable` (Node já traz o Corepack) ou
  `npm i -g pnpm`
- **Git**
- **Docker Desktop** (com WSL2 no Windows) — para PostgreSQL e Redis locais
- **Android SDK** (`ANDROID_HOME`) + **JDK 17 ou 21** — apenas se for
  compilar o driver-app nativamente para Android
- **Xcode** (macOS) — apenas se for compilar o driver-app nativamente para
  iOS

## Instalação

```bash
pnpm install
```

Copie os arquivos de ambiente:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# edite os valores conforme necessário
```

## Subindo a infraestrutura (PostgreSQL + Redis)

```bash
docker compose up -d
docker compose ps
```

Os valores de usuário/senha/porta vêm do `.env` da raiz (usado pelo
`docker-compose.yml`). Nenhuma credencial real é versionada.

> **Porta 5432 em uso?** Se você já tem um PostgreSQL nativo instalado (ex.:
> como serviço do Windows), a porta padrão 5432 pode já estar ocupada. Nesse
> caso, defina `POSTGRES_PORT` (e o host/porta em `DATABASE_URL`) para outra
> porta livre, ex. `5434`, no `.env` da raiz e em `apps/api/.env`.

## Seed (região padrão + admin bootstrap)

```bash
pnpm --filter @motoboycity/api run prisma:seed
```

Cria uma `Region` padrão (necessária para cadastro de empresa) e um usuário
`ADMIN` bootstrap — não existe autocadastro de administrador. Credenciais
via `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` em `apps/api/.env`, ou o padrão
de desenvolvimento (`admin@motoboycity.local` / `admin_dev_only_change_me`,
ver `apps/api/prisma/seed.ts`) se não definidas. Troque a senha antes de
expor a API publicamente.

## Rodando o monorepo

```bash
pnpm dev          # roda todos os apps em modo desenvolvimento (via Turborepo)
pnpm build        # build de todos os apps buildáveis
pnpm lint         # lint em todos os workspaces
pnpm typecheck    # checagem de tipos em todos os workspaces
pnpm format       # formata o repositório com Prettier
pnpm format:check # verifica formatação sem alterar arquivos
```

## Rodando cada aplicação individualmente

### API (NestJS)

```bash
pnpm --filter @motoboycity/api run dev
curl http://localhost:3333/health
# {"status":"ok"}
```

### Company Web

```bash
pnpm --filter @motoboycity/company-web run dev
# http://localhost:3000
```

### Admin Web

```bash
pnpm --filter @motoboycity/admin-web run dev
# http://localhost:3000 (rode em porta diferente se ambos estiverem ativos)
```

### Driver App (React Native)

```bash
pnpm --filter @motoboycity/driver-app run dev      # Metro bundler
pnpm --filter @motoboycity/driver-app run android  # requer emulador/dispositivo Android
pnpm --filter @motoboycity/driver-app run ios      # requer macOS + Xcode
```

## Decisão: React Native CLI (bare) vs. Expo

**Escolhido: React Native CLI / bare.**

O Driver App terá, em fases futuras, requisitos nativos profundos e
contínuos: GPS em segundo plano (foreground service dedicado no Android),
FCM com mensagens data-only para acordar o app e disparar alarmes/vibração
mesmo com o app fechado, wake locks customizados, e "eventual integração com
recursos específicos do Android" (requisito explícito desta fase). Esse
perfil é comparável ao de apps como iFood Entregador/Uber Driver, cujo valor
central depende de controle fino sobre o sistema operacional.

O Expo com Development Build (via `expo prebuild`) evoluiu bastante e hoje
permite código nativo customizado, mas ainda introduz uma camada de
config plugins e convenções próprias entre o código React Native e os
projetos nativos gerados. Para um app cujo diferencial é justamente esse
controle nativo fino e contínuo — não um caso pontual de um módulo nativo
isolado — o React Native CLI (bare) evita essa camada intermediária e dá
acesso direto e permanente aos projetos Android/iOS, sem risco de esbarrar
em limitações do sistema de plugins do Expo mais adiante.

Trade-off aceito: perdemos a conveniência do Expo Go/EAS Build gerenciado e
OTA updates simplificados — nenhum dos dois é relevante para os requisitos
deste produto.

## Infraestrutura preparada (sem regras de negócio)

- **Prisma**: `apps/api/prisma/schema.prisma` contém apenas os blocos
  `generator` e `datasource`. Nenhum model de negócio foi criado.
- **BullMQ**: `apps/api/src/queue/queue.module.ts` registra a conexão com o
  Redis (`BullModule.forRootAsync`). Nenhuma fila (`registerQueue`) foi
  criada — isso não abre conexão com o Redis até que uma fila seja
  registrada em uma fase futura.
- **Socket.IO**: `apps/api/src/realtime/realtime.gateway.ts` expõe um
  gateway vazio (apenas loga conexões/desconexões). Nenhum evento de
  negócio foi definido.
- **Prisma Client**: a conexão é preguiçosa (`PrismaService` não chama
  `$connect()` no boot) — a API sobe e responde `/health` mesmo sem
  PostgreSQL disponível.

## Único endpoint da API nesta fase

```
GET /health → { "status": "ok" }
```
