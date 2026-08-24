---
name: motoboycity-delivery-core
description: Implement, diagnose, or review MOTOboyCity delivery-domain changes involving orders, pricing, Google Maps distance, dispatch, BullMQ offers, driver presence, Socket.IO events, cancellation, or delivery status transitions. Use for work under apps/api/src/deliveries, dispatch, delivery-offers, driver-presence, pricing, maps, or realtime.
---

Work from the actual delivery flow: company address -> distance -> quote -> `Delivery` and history -> dispatch queue -> driver offer -> response.

1. Read the affected controller, service, Prisma models, shared validation/types/client, and existing specs before editing.
2. Preserve frozen delivery prices and the invariant `driverValue + platformValue === totalValue`.
3. Treat `Delivery` status updates and offers as concurrent operations. Use conditional writes and transactions for state changes; make retries/job handlers safe to repeat.
4. Check authorization and ownership for company, driver, and admin paths. Revalidate current driver eligibility before any action that assigns or accepts work.
5. Do not add a status, return behavior, batch behavior, or proof requirement without tracing every client and persistence consequence. The local Prisma batch-order change is work in progress, not an approved API contract.
6. Convert Maps/API failures into explicit domain-safe errors; never invent a distance or price.
7. Update focused unit tests for normal, unauthorized, invalid-transition, timeout, cancellation, and concurrent paths. Run the API test subset plus typecheck.

Do not use this skill for a schema/migration-only change; use `motoboycity-prisma-contracts` first. Do not implement payment, wallet, invoice, upload, GPS, or push behavior unless the request explicitly includes it.
