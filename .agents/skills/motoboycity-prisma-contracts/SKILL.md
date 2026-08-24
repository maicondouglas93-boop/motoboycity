---
name: motoboycity-prisma-contracts
description: Safely plan or implement MOTOboyCity Prisma schema, migration, database, API contract, Zod validation, shared TypeScript type, or shared API-client changes. Use whenever a request changes persisted data, routes, request/response payloads, enums, or packages/validation, packages/types, or packages/api-client.
---

Treat Prisma schema, migrations, API code, Zod schemas, shared types, API client, and UI/mobile consumers as one contract chain.

1. Inspect the current schema, all related migrations, controller/service, validation schema, exported type, API client, and every consumer with `rg`.
2. Check `git status` and preserve the existing uncommitted `schema.prisma` work. Do not build a migration on top of ambiguous batch-order changes until their intended scope is confirmed.
3. For a data change, state the existing-data impact, migration order, backup requirement, deploy sequence, and rollback path before editing.
4. Make migrations additive and immutable after application. Never modify a committed migration to change an environment already deployed.
5. Keep Zod input validation, controller/service output, `packages/types`, and `packages/api-client` synchronized. Do not silently make fields nullable or optional across only one layer.
6. Regenerate Prisma client and run migration commands only when the requested task explicitly authorizes database changes and an isolated target is known.
7. Validate with Prisma schema validation, focused tests, API/client typecheck, and migration testing in an isolated database when applicable.

Do not use this skill for CSS-only work or a read-only audit. Stop and ask for direction when a product decision is required to define a persistent data contract.
