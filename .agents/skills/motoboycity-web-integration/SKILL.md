---
name: motoboycity-web-integration
description: Implement, diagnose, or review MOTOboyCity company-web or admin-web changes in Next.js, TanStack Query, authentication gates, API-client integration, Socket.IO admin activity, forms, and real-versus-mock UI state. Use for work under apps/company-web or apps/admin-web.
---

1. Identify whether the target screen is backed by a real endpoint or `mock-data`; do not imply a mock screen is integrated.
2. Read the route, layout/auth gate, API client factory, session storage, relevant shared package, and backend endpoint before changing behavior.
3. Keep authorization enforced by the backend. Add role-aware client routing only as user experience defense, never as the sole permission control.
4. Use TanStack Query for server state, invalidate the narrow relevant query after mutation, and show API errors through `ApiError` rather than hiding failures.
5. Preserve app-specific navigation and avoid copying company behavior into admin unless its server permission is confirmed.
6. Do not add browser-only secrets or use `NEXT_PUBLIC_*` for credentials.
7. Validate with the affected app typecheck/lint, build when requested, and a manual browser flow against a safe API environment.

Do not use this skill for React Native, Prisma migrations, or backend dispatch changes; coordinate with the relevant skill when a contract must change.
