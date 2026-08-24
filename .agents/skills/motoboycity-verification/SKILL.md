---
name: motoboycity-verification
description: Audit or verify MOTOboyCity changes for regressions, tests, security, dependency risk, configuration, release readiness, and documentation accuracy. Use for code review, debugging plans, test strategy, security review, CI/CD readiness, or before declaring a change production-ready.
---

1. Start with the concrete change or user flow. Trace its API, authorization, persistence, client, and queue/realtime dependencies.
2. Prioritize correctness, security, race conditions, data loss, authorization, error handling, and missing tests over style-only findings.
3. Use `git diff`, focused `rg` searches, existing specs, `pnpm typecheck`, `pnpm lint`, and relevant test commands. Avoid migrations, seed, deployment, or destructive commands unless explicitly authorized.
4. Treat the current API unit-test suite as useful but insufficient: web has no automated tests and mobile has limited coverage. State coverage gaps precisely.
5. Check changes to secrets, JWT/session handling, CORS, admin routes, Prisma migrations, third-party keys, and dependency advisories.
6. Report evidence by file and symbol; distinguish confirmed defects from risks and unimplemented features.
7. Conclude with test results, remaining risks, and whether the changed scope is ready to merge, not a claim about whole-product production readiness unless deployment evidence exists.

Do not modify application code during a read-only audit unless the user explicitly requests a fix after reviewing findings.
