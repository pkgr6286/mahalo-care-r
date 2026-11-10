# Mahalo Care

A single-practice care-management demonstration covering RPM, RTM, CCM, PCM and BHI with a shared patient record.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/mahalo-care run dev` — run the React web application
- `pnpm --filter @workspace/api-server test` — pure billing, time, rule and period tests
- `pnpm --filter @workspace/api-server test:api` — real HTTP/database checks against the running synthetic demo; creates an inactive workflow-test patient
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle), Vite

## Where things live

- `artifacts/mahalo-care`: clinician web workspace and responsive patient web app
- `artifacts/api-server`: session authentication, clinical workflows, billing evidence, exports and adapter simulations
- `lib/db`: Drizzle schema
- `lib/api-spec/openapi.yaml`: API contract; regenerate hooks and validators after changing it
- `docs/DEMO-GUIDE.md`: demo flow, verification scope and production limitations

## Architecture decisions

- Keep the existing Express server rather than replacing the framework: the requested Node stack does not require a rewrite.
- All data and connected workflows are restricted to a synthetic demo. This is not a PHI-capable or reimbursement-certified deployment.
- EHR, video and outbound notifications use explicit simulated adapters. They must never be presented as live.
- Live AI drafting is opt-in, uses synthetic charts only and requires human acceptance. Deterministic test mode remains the default. No draft signs a note or commits time automatically.
- The current demo serializes conflicting clinical mutations with a PostgreSQL advisory transaction lock. Revisit this bottleneck and owner-level bootstrap DDL before production.

## Product

Staff have a today dashboard, worklists, unified patient chart, five program workflows, consents and signed/versioned documents, observations and rules, tasks, time, billing evidence, messages, device and configuration management, CSV/XLSX exports and PDF documents. Patients have email/password access restricted to their own record, check-ins, adherence, secure messages and consent withdrawal. A network-only PWA shell does not cache clinical data.

## User preferences

- Build one complete tenant/practice for demonstration now; defer multi-tenant support.
- Use React, Node, PostgreSQL and Drizzle.
- Use email/password authentication now; add other authentication systems later.
- Native mobile is the next step, not part of this build.
- Ignore GitHub Actions, automatic PR workflows and the document's Claude Code implementation workflow.
- Build and verify locally; help with GCP deployment later. Do not provision or publish cloud resources without a separate user decision.

## Gotchas

- PDFKit and ExcelJS must remain external in the API bundle; their runtime assets are not safely bundled.
- The initial development bootstrap creates demo accounts and an immutable audit trigger; it requires database owner privileges and is not a production migration mechanism.
- Do not add offline PHI caching or an authentication bypass to inspect signed-in screens.
- Generated Zod path and query parameter names can collide. Verify the complete codegen/typecheck when adding path+query parameters.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
