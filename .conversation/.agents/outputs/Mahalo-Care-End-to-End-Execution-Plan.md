# Mahalo Care — End-to-End Execution Plan

**Status:** Proposed for review. No application implementation, account changes, or cloud provisioning has started.

**Source:** Mahalo Care Platform — Build Specification v2, 86 pages, supplied in this conversation.

## 1. Execution agreement

Build the complete v1 care-management platform described in the specification, with a modern, restrained interface, real persisted workflows, repeatable local tests, and a controlled path to GCP production.

The user's instructions override the document's prescribed development workflow:

- React frontend; Node.js backend; PostgreSQL with Drizzle.
- No GitHub Actions, automated pull requests, mandatory Linear workflow, or Claude Code dependency.
- Implement and verify incrementally in the development environment. Do not defer essential tests to a future CI system.
- Retain portable source code, local version history/recovery points, Docker packaging, infrastructure definitions, and release evidence. No repository publication is implied.
- Show and approve this plan before starting the application.
- Synthetic patient data only during development. Production data and production credentials remain outside the development workspace.

“Local” means the environment where the code is running, not automatically the user's own computer. If the user means their laptop, an explicitly shared local environment is required. Docker and browser capabilities will be checked before choosing the executable setup; a Docker-capable development sandbox or workstation is the target for full container validation.

### Scope boundary: native mobile

The source includes two native applications in v1. They are retained below as a distinct workstream, not silently removed or represented as a PWA.

This conversation is currently in the Replit iOS app, which cannot create a new native mobile application. Native application creation must begin on replit.com. The web workspace, responsive clinician experience, backend, patient PWA, tests, and GCP preparation can proceed independently after plan approval.

Bluetooth, HealthKit, Health Connect, native background behavior, and store releases require supported native tooling and physical-device testing. They cannot be certified by browser tests or a simulator alone.

## 2. Product scope

### Clinician and care-manager workspace

- Exception-first home; assigned exceptions; team queue; due-today work; at-risk enrollments; unsigned documents; device issues; CoCM registry.
- Patient search and filtering; unified patient identity, home location, care team, conditions, coverage, medications, and caregiver permissions.
- Patient timeline spanning observations, check-ins, adherence, interactions, exceptions, messages, notes, and time.
- Parameter charts with thresholds and invalid-reading explanations.
- Enrollment, consent, care-plan creation/review/signature/version comparison, notes/amendments, document export.
- One active timer per user; manual time; interactions; program attribution and billing progress.
- Secure messaging, call logging, video workflows, AI draft review, and read-only EHR context.
- Program dashboards, billing operations, operational reports, and a command palette.

### Administration and platform operations

- Tenants, sites, users, invitations, credentials, location-scoped roles, MFA, optional enterprise OIDC.
- Versioned program rule packs for RPM, RTM, CCM, PCM, and BHI, including general BHI and CoCM.
- Cardiovascular, diabetes, musculoskeletal, and behavioral-health therapeutic templates; respiratory RTM care-plan support.
- Template publishing, clinical rules, historical rule testing, payer restrictions, device fleet, integration health, and branding.
- Configuration import/export, tenant bootstrap, audit search/export, access reviews, integration reports, and retention policies.
- Approved support sessions and audited break-glass access.

### Patient PWA

- Invite and one-time-code onboarding; consent; caregiver access.
- Today's tasks; reading status; exercises; medications; education; check-ins and instrument scores.
- Plan and goals; progress; messages; video; callback request; preferences and quiet hours.
- Installability and browser-supported push; carefully scoped offline task/check-in submission.
- No claim that the PWA replaces native BLE or health-platform integration.

### Integration, billing, and operational scope

- Signed device webhook intake, scheduled vendor pull, normalization, replay protection, device assignments, device-day calculation, and simulator.
- FHIR R4 read, human-confirmed patient matching, first agreed OmniMD adapter, PDF exports.
- Secure in-app communication; PHI-free SMS/email/push notifications and delivery tracking.
- Governed AI: patient summary, monthly-note draft, queue prioritization suggestion, message draft, and time suggestion.
- Billing evidence for all five programs; period close/reopen; candidate review; approval/rejection; CSV/XLSX; per-patient evidence PDFs.
- Read-only tenant integration API with scoped client authentication.
- Validated legacy imports, onboarding/training materials, and pilot reconciliation.

### Explicit exclusions

No claim submission, clearinghouse integration, reimbursement calculation, automated billing determinations, autonomous clinical decisions, AI diagnosis/treatment, emergency response service, v1 EHR write-back, research bridge, reseller hierarchy, or later-phase barrier clustering. Existing source-code reuse is not assumed.

## 3. Recommended architecture

Use a **TypeScript modular monolith**, not microservices. One domain model and database, with separate deployable web, API, and background-worker processes.

| Area | Recommended choice |
|---|---|
| Runtime | Supported Node.js LTS and strict TypeScript, pinned after compatibility verification |
| Workspace | pnpm workspaces and Turborepo |
| Frontend | React, Vite, TanStack Router/Query/Table/Virtual |
| Forms and contracts | React Hook Form, Zod, generated OpenAPI and typed client |
| Interface | Tailwind CSS, shadcn/ui/Radix, consistent Lucide outline icons |
| API | Fastify, small module APIs, explicit authorization and domain services |
| Database | PostgreSQL 16 baseline, Drizzle schema and reviewed SQL migrations |
| Identity | Better Auth with PostgreSQL sessions, MFA/passkeys, OIDC adapters |
| Jobs | BullMQ and Redis with no-eviction configuration |
| Documents | Versioned HTML/React templates rendered with Playwright/Chromium |
| Tests | Vitest, real PostgreSQL/Redis integration tests, Playwright, Storybook, accessibility checks, load tests |
| Operations | Structured redacted logs, request IDs, health/readiness, metrics and optional OpenTelemetry |
| Packaging | Separate non-root Docker images and a reproducible local service stack |
| GCP | Terraform, Artifact Registry, Cloud Run, Cloud SQL, Memorystore, Cloud Storage, KMS, Secret Manager, load balancer/Cloud Armor |

The document pins Node 22 and several package majors. At foundation time, verify supported lifecycles and compatibility rather than copying dated pins or independently selecting “latest” for every library.

### Proposed structure

```text
apps/
  web/                 clinician and tenant-admin workspace
  patient/             patient PWA
  api/                 Fastify modular monolith
  worker/              background processing and schedules
  patient-mobile/      native workstream, created on replit.com
  clinician-mobile/    native workstream, created on replit.com
packages/
  config/              validated configuration and environment safeguards
  db/                  Drizzle schema, migrations, roles and seed helpers
  contracts/           Zod contracts, OpenAPI and client types
  ui/                  web components, tokens and Storybook
  domain/              pure shared business logic, including billing
  rulepacks/           versioned program and therapeutic defaults
  adapters/            storage, encryption, communications, EHR, devices, AI
  pdf/                 document templates
  prompts/             prompt versions, schemas and evaluations
  mobile-core/         native shared logic when native work begins
  ui-native/           native component library
  device-ble/          per-model native device adapters
tools/                 simulator, configuration transfer, seeds and imports
infra/                 local services, Dockerfiles and Terraform
docs/                  requirements map, decisions, test evidence and runbooks
```

The web image can serve the staff application and the patient PWA at distinct paths. The API remains same-origin under `/api`; webhook routing is explicit. Runtime browser configuration avoids rebuilding the frontend for every environment.

### Core engineering rules

1. All configuration enters through one validated module. Secrets never appear in source, reports, logs, or screenshots.
2. External vendors sit behind adapters; development uses synthetic fixtures, local storage, notification capture, video stubs, and deterministic AI where appropriate.
3. Tenant tables have tenant-aware keys and constraints, forced RLS, and request/job transaction-scoped tenant context. Ordinary processes never use a database owner or bypass-RLS role.
4. Identity is separated from tenant membership; patient/caregiver identities have explicit scope. Do not blindly adopt the document's single-tenant user row if multi-tenant membership is required.
5. Audit records are append-only for application roles. Authorized audit reading uses a separate controlled path; there is no generic application update/delete privilege.
6. Signed clinical records are immutable; amendments and plan edits create versions.
7. Database transactions protect clinical state transitions. A transactional outbox bridges committed data and queued work; duplicate delivery is expected and safely handled.
8. Jobs carry tenant context, stable identities, bounded retries, failure visibility, and replay support. Schedules remain safe during overlapping deployments.
9. Billing calculation is deterministic and separate from evidence persistence and period lifecycle.
10. AI writes drafts only, using restricted database access. Human acceptance is an explicit, authorized event.

## 4. UI direction and design acceptance

Use the source's exception-first product structure and Mahalo colors, with a polished clinical interface rather than a decorative dashboard.

- Navy navigation (`#071C3B`), indigo action accent (`#3D36E8`), near-white canvas (`#FAFBFD`), quiet borders, restrained elevation, clear status semantics.
- Inter for workspace text; Atkinson Hyperlegible for patient text; tabular numerals. Use the named title font only with an appropriate license, otherwise select an available, licensed substitute.
- Consistent flat outline icons; no decorative icon tiles, excessive gradients, or arbitrary rainbow charts.
- Seven top-level navigation items: Today, Worklists, Patients, Programs, Billing, Reports, Administration.
- Patient header prioritizes identity, location, active programs, evidence progress, live-interaction status, exceptions, next task, and timer.
- Comfortable/compact density, persisted filters, URL-shareable views, sensible table columns, and progressive disclosure.
- Complete loading, empty, error, validation, permission-denied, offline, and retry states.
- Responsive workspace; large patient text and touch targets; keyboard support, visible focus, screen-reader labels, and tested contrast.

The first review checkpoint includes the Today page, patient record, billing view, and patient home as working screens. Approval there establishes the design direction; every later feature uses the same components. Browser screenshots, Storybook states, accessibility checks, and manual assistive-technology review provide evidence; automated scans alone do not prove WCAG conformance.

## 5. Execution phases and completion gates

These phases are delivery order and dependencies, not a promise of calendar duration. Each phase ends with a demonstration, local test evidence, and an updated requirements map. A feature is not complete because its screen exists.

### Phase 0 — Requirements, risks, and executable foundation

**Work**

- Turn sections 1–19 into a requirement-to-screen/API/schema/test matrix.
- Record user overrides, exclusions, assumptions, open vendor/CMS decisions, and exact acceptance criteria.
- Check actual runtime, browser, database-role, Redis, resource, and container capabilities.
- Set up the workspace, version pins, commands, test databases, synthetic fixtures, and recovery points.
- Prove PostgreSQL extensions, forced RLS with a non-owner role, Redis retry/scheduling behavior, Chromium PDFs, and a container build where Docker is available.
- Establish configuration, adapter contracts, health/readiness, audit baseline, and PHI safeguards.

**Gate:** Fresh setup works; two tenants are isolated under the real runtime role; a synthetic PDF renders; a restarted worker processes a retried job without duplicate effects; the executable verification strategy has no hidden CI dependency.

### Phase 1 — Identity, tenancy, design system, and application shell

**Work**

- Authentication, MFA, sessions, invitations, location-scoped roles, tenant selection, and audit.
- Staff/patient/caregiver access boundaries, baseline admin, branding, density, navigation, and command palette.
- Shared component library and Storybook.
- Working Today, patient-header, billing-layout, and patient-home design examples using persisted synthetic data.

**Gate:** Users can authenticate and access only permitted tenants/sites; patient access cannot reach staff resources; critical UI states are demonstrated and the visual direction is ready for review.

### Phase 2 — Patient record, programs, enrollment, consent, and care plans

**Work**

- Demographics, conditions, medications, coverage, caregivers, home locations, and timeline.
- All five program definitions, therapeutic defaults, program configuration and template versioning.
- Enrollment lifecycle, eligibility and concurrency validation, versioned consent and revocation.
- Care-plan editor, required fields, goals, RRULE items, signature, amendments, version diff, discharge, and care-plan/consent PDFs.
- Configuration import/export with dry-run validation, references remapping, and no patient records.

**Gate:** An admin configures a program without code; a clinician enrolls a synthetic patient, captures consent, signs/versions a plan, and downloads a verified PDF. Invalid activation is blocked. Configuration transfers safely to another synthetic tenant.

### Phase 3 — Observations, devices, tasks, instruments, and patient PWA

**Work**

- Catalog and fleet; assignment, shipment/setup/return and device health.
- Signed webhook inbox, normalized units/LOINC, replay protection, pull cursors, invalid readings and late arrivals.
- Device-day counting by patient timezone and program data provenance.
- Signed simulator scenarios: normal, rising values, missing days, invalid values, duplicates and delayed delivery.
- Licensed/approved ePRO instruments with server-side scoring and rule-triggered tenant-approved crisis messaging.
- Task materialization, adherence/barriers, exercises, medication and education workflows.
- Patient onboarding, daily tasks, reading status, check-ins, plan, progress, preferences, caregiver access and limited offline queue.

**Gate:** A reading travels from signed intake to patient chart and a single eligible device day; a patient completes a check-in and task; offline replay creates no duplicates or cross-account leakage.

### Phase 4 — Rules, worklists, clinical time, notes, and communication

**Work**

- All seven rule kinds, clinical defaults with reviewer metadata, historical previews, deduplication, escalation, ownership and resolution.
- Every specified worklist and the CoCM registry, with persisted filters and bulk assignment.
- Timer, recovery across refreshes, one-active-timer enforcement, manual entries, credential snapshots and overlap constraints.
- Interactions, notes, signing/amendment, PDFs, secure threads, attachments and notification status.
- Video adapter and sandbox two-participant testing when available; failure and delivery-receipt handling.

**Gate:** A critical synthetic reading opens exactly one owned exception; staff review, contact, resolve, commit time and sign a note; the full chain is auditable. Call initiation alone does not count as successful two-way contact.

### Phase 5 — Billing evidence, periods, reconciliation, and reports

**Work**

- Pure evidence engine for every program and code family, using versioned rule packs and approved payer constraints.
- Calendar-month and rolling supply periods; exact duration arithmetic; add-on limits; credential/activity eligibility; concurrency.
- Close/reopen locks, late-data policy, frozen evidence snapshots, input references and idempotent period jobs.
- At-risk dashboard, per-patient progress, candidate/approved/rejected/exported workflows, CSV/XLSX, PDF audit packs.
- Operational reports and complete synthetic month generator.

**Gate:** Hand-calculated fixtures agree with the engine for all program families and threshold boundaries. Every counted duration has traceable allocation and is used at most once across programs. Repeating close changes nothing; approved reopening produces a new auditable revision.

CMS/payer review is required before treating provisional code values as production rules. Local calculation tests establish implementation correctness against approved rules, not reimbursement eligibility.

### Phase 6 — EHR, governed AI, advanced administration, and migration tools

**Work**

- FHIR resource reads, pagination, authentication refresh, retry, incremental sync and human-confirmed patient matching.
- OmniMD adapter to documented, agreed endpoints; no assumed write-back.
- All five AI capabilities with structured outputs, source references, numeric validation, restricted write permissions, acceptance/rejection/edit events, usage limits and evaluations.
- Break-glass, tenant-approved support sessions, read-only customer API, access reviews, audit integrity reporting, patient exports and retention tasks.
- Legacy CSV dry-run import, identity resolution, consent provenance, validation reports and repeat-import safety.
- Provider-backed SMS/email/video/device/EHR tests when sandbox access is available.

**Gate:** A fixture-backed EHR workflow passes locally; available provider sandboxes pass separately; AI cannot alter clinical state without human acceptance; invalid imports are rejected with a useful report.

### Phase 7 — Full local release qualification

**Work**

- Run the complete verification command from a clean environment, not only incremental checks.
- Run all end-to-end journeys, role/tenant/site negative cases, accessibility and visual checks, and production builds.
- Exercise production-shaped containers, migrations, upgrade compatibility, crash/retry/replay cases, backup/restore, and volume/performance scenarios.
- Scan dependencies, secrets and images; fix critical/high findings or explicitly document any unresolved release blocker.
- Finish operator, admin, deployment, rollback, restore, incident and period-close guides.

**Gate:** A reproducible local release candidate exists with reports, screenshots, test results, image digests where built, and a plain list of limitations. Mock-backed integrations are visibly marked; unavailable checks are “not run,” never “passed.”

### Phase 8 — GCP staging, production preparation, and controlled cutover

**Work**

- Use reviewed Terraform and manually invoked release scripts; no GitHub Actions.
- Provision synthetic dev/staging first; establish regional networking, service identities, SQL, Redis, storage, keys, secrets, images, TLS, ingress and monitoring.
- Run the migration job and reference seed; import tenant configuration, not synthetic patients into production.
- Validate actual production drivers on synthetic staging, then run the full cloud acceptance suite, load tests and restore drill.
- Complete qualified clinical/billing/security reviews, contractual checks and independent penetration testing.
- Obtain explicit approval before paid provisioning, irreversible retention locks, production deployment or real-data migration.
- Cut over the first tenant with reconciliation, named operators and an application/database recovery plan.

**Gate:** GCP staging passes its own checks, production prerequisites are evidenced, and a separately approved release deploys by immutable image digest. A successful local run does not waive this gate.

### Native workstream — full v1 scope, separately gated

Begin creation on replit.com. Reuse backend contracts, domain rules, tokens and adapters.

- Patient app: onboarding, tasks, readings, exercises, instruments, medication, progress, messages/video, plan, devices and settings.
- Clinician companion: sign-in/MFA, Today, exception actions, patient context, timer, quick draft notes and messages/video.
- Native secure storage and lock, offline queue, notifications, per-model BLE, consented HealthKit/Health Connect.
- Unit/component tests plus native end-to-end flows; physical iOS/Android device tests for each supported device model, permission state and reconnect/background scenario.
- Production API profiles, privacy disclosures and release readiness.

Native builds and iOS release use supported tooling after moving creation to the web interface. Google Play publishing is not offered through this workflow; Android store submission remains an external owner-managed step. Store approval and hardware behavior are external acceptance dependencies.

### Pilot — completion beyond software delivery

Configure the first real tenant only in approved GCP production. Rehearse legacy migration using synthetic fixtures, then conduct any real-data rehearsal only in an authorized PHI environment. Train staff, monitor operational behavior and reconcile the first actual billing month with the customer's billing team. A generated synthetic month cannot replace that pilot.

## 6. Local testing plan

### Test levels

| Level | What is actually tested |
|---|---|
| Static and build | Formatting/lint, strict types, dependency boundaries, contracts, builds of all applicable applications |
| Unit | Eligibility, code thresholds, intervals, concurrency, rule evaluation, scoring, recurrence, timezone conversions and AI output checks |
| Database/API | Real PostgreSQL and Redis; roles/RLS, constraints, auth, tenant/site permissions, state transitions, audit immutability, idempotency and transactions |
| Background jobs | Retry/backoff, duplicate deliveries, crash recovery, scheduler registration, inbox/outbox recovery and close/reopen races |
| Browser journeys | Staff/admin/patient/caregiver paths, persisted state, direct API-negative checks, downloads and expired sessions |
| UI quality | Storybook states, screenshot regression, keyboard interaction, automated accessibility and manual review |
| Integration contracts | Recorded synthetic fixtures and deterministic mocks, plus separate real-provider sandbox checks |
| Performance | Seeded 5,000 enrollments and a representative 12-site/10,000-patient model; pagination, query plans, queue throughput and connection budgets |
| Packaging | Fresh installation, compiled processes, container boot/readiness, environment validation and migration compatibility |
| Recovery/security | Restore, secret/log leakage, hostile payloads, CSRF, attachment authorization, link expiry, privilege escalation and revoked sessions |

Coverage targets: at least 85% for billing/time/rules/rule packs and 70% elsewhere, with explicit critical-path and negative-case requirements. Coverage percentages are not correctness guarantees.

### Required scenario families

- RPM/RTM device-day and management threshold boundaries; base/add-on exclusivity; all other program families.
- Multiple programs with zero duplicate time allocation; concurrent timer requests and overlapping manual entries.
- Sub-minute durations without rounding; DST, leap days, midnight, differing tenant/patient zones and late-arrival cutoff.
- Readings duplicated, delayed, out of order, invalid, unassigned, incorrectly signed, or retried after worker failure.
- Plan/consent revoked or superseded during a period; signed-note mutation attempts; previously approved rule versions.
- Cross-tenant/site access through guessed IDs, nested resources, background jobs, documents, exports, caches and support paths.
- Wrong-patient EHR match prevention; partial FHIR failure; missing vendor capability.
- Offline submission replay after logout, account switching or consent revocation.
- AI unsupported numbers, malicious text in source records, treatment suggestions and acceptance bypass attempts.
- PDF/source version/hash matching and correct rejection of expired or unauthorized downloads.
- Repeated close, simultaneous close, reopen, re-export and imported duplicates.

### Proposed commands

These are deliverables to implement, not commands that already exist:

```text
pnpm setup:local
pnpm dev
pnpm seed:demo
pnpm seed:month
pnpm seed:scale
pnpm sim:device
pnpm verify:fast
pnpm verify:full
pnpm test:integration
pnpm test:e2e
pnpm test:security
pnpm test:performance
pnpm test:containers
pnpm release:check
```

`verify:fast` runs touched-area checks during development. `verify:full` includes the full applicable local suite and reports any unavailable provider/device checks explicitly. Destructive test resets require an unmistakable test-database identity; they cannot target production.

## 7. GCP deployment without GitHub Actions

### Target layout

- Separate GCP dev, staging and production projects; validate region and service eligibility before final selection.
- Load balancer, managed HTTPS certificates, tenant domains and Cloud Armor. Prevent direct API ingress from bypassing the intended edge.
- Web static container, API container and a continuously running worker with bounded resources. Verify the current best-supported Cloud Run worker configuration.
- Cloud SQL PostgreSQL with private connectivity, production HA, appropriate backup retention and PITR.
- Memorystore compatible with BullMQ connection/security/no-eviction requirements.
- Cloud Storage with tenant-scoped access, expiring links, lifecycle/retention rules and encryption settings.
- KMS, Secret Manager, least-privilege identities, Artifact Registry, monitoring and immutable audit export.

### Release sequence

1. Complete local release checks and identify the exact source revision.
2. Build images locally in a Docker-capable environment; produce an SBOM, scan and record digests.
3. If local image building is unavailable, report that limitation. A manually triggered Cloud Build is an optional approved substitute, not a local pass and not GitHub Actions.
4. Authenticate the authorized operator without placing production credentials into the development workspace. Use GCP-side execution such as Cloud Shell for production operations.
5. Review Terraform plan, expected recurring costs, IAM, region and irreversible changes; obtain approval before apply.
6. Set secrets directly in Secret Manager and deploy the same images by digest to synthetic dev/staging.
7. Run migrations as a separate job with migration-only credentials; run reference-data seed and validated configuration import.
8. Execute cloud smoke/E2E tests, real adapter checks, scheduled-job/restart checks, performance tests, monitoring failure tests and backup restore.
9. Complete production-readiness review and obtain separate deployment approval.
10. Promote the tested digests to production, using backward-compatible migrations and controlled traffic rollout.
11. Monitor agreed technical and operational gates; roll back application traffic if required.

Database rollback is not blindly “run down migrations.” Use expand/contract changes and previous-release compatibility; if recovery needs PITR, restore to a new instance and assess potential data loss before repointing.

### Production prerequisites that code cannot supply

GCP billing/IAM/DNS access; appropriate organizational agreements; covered-service and AI-model eligibility; vendor contracts and sandbox/live accounts; approved senders/domains; documented EHR access; device model/protocol details; clinical/billing approvals; security risk assessment; penetration testing; incident owners; and approved data-migration procedures.

Software safeguards support a compliance program. They do not by themselves establish HIPAA compliance, medical-device classification, or legal sufficiency. Provider availability, BAA scope, pricing, quotas and regional support must be checked against current official information during deployment preparation.

## 8. Source ambiguities and proposed resolutions

1. **Billing reconciliation:** The source equates approved-line minutes with all committed minutes. That fails for ineligible time, insufficient thresholds and shared evidence repeated on base/add-on lines. Use an allocation ledger: every committed interval is classified as eligible/ineligible, allocated/unallocated and explained; no interval is allocated twice; supported units reconcile to the applicable evidence.
2. **Time precision:** Store exact intervals/duration, not rounded integer-minute totals. Compare exact thresholds and format minutes only for display.
3. **Exception deduplication:** The source describes both a 24-hour dedupe window and one open exception per patient/rule. Keep one open exception per patient/rule with a unique constraint; use a separate signal history/window policy for suppression and reopening.
4. **Live interaction:** Creating a video room or clicking a phone button does not establish two-way contact. Track initiation, attendance/connection and completion or clinician-attested evidence as appropriate.
5. **Tenant identities:** Separate global authentication identities, tenant memberships and location-scoped assignments. Do not trust an unvalidated client tenant parameter.
6. **Missing schema relationships:** Add explicit CoCM role assignments, instrument/task scheduling, note templates, runtime patient/caregiver identities, consent provenance, rule signal history, job outbox and frozen evidence input references.
7. **PHI environment guard:** Driver checks cannot detect or prevent someone uploading real data. Combine them with access controls, restricted import tools, synthetic seed rules, redaction tests and operational policy.
8. **AI safety:** Numeric matching and a forbidden-phrase classifier are defense-in-depth, not clinical safety certification. Require provenance, structured checks, evaluations, clinician review and restricted database permissions.
9. **PDF hash:** A PDF cannot naively embed its own final-file hash without a self-reference problem. Store the final PDF hash externally and, if a hash appears in the footer, define it as a signed source-content hash; document both.
10. **Audit integrity:** INSERT-only tables do not prevent a database owner from changing data. Use controlled privileged access, tamper-evident integrity verification and external locked exports, with explicit threat-model limits.
11. **Migrations:** Drizzle does not supply a universal safe production rollback by default. Write and test reversible local fixtures where appropriate; prefer forward fixes and expand/contract production changes.
12. **Device provenance:** A mobile application's signature establishes an enrolled app/session source, not proof of a genuine medical-device measurement. Device/model validation and billing eligibility require documented provenance and clinical/regulatory review.
13. **PWA offline privacy:** Do not blindly persist all query results or PHI in browser storage. Minimize cached data, define allowed queued actions, expire and purge data, prohibit patient data in service-worker static caches, and get privacy review before PHI use.
14. **Cloud configuration:** Runtime sizes, backup limits, worker products, Redis options and Vertex model coverage in the source are proposals, not verified deployment facts. Validate them against current provider documentation before provisioning.
15. **Clinical/legal claims:** Do not adopt the document's “not a medical device” or compliance assertions as established facts; obtain qualified review.

## 9. Progress reporting and definition of done

After each phase, provide:

- Working functionality demonstrated with synthetic data and a preview where available.
- Requirements completed and any explicit deviations.
- Local checks actually run, their results, and reproducible commands.
- Screenshots and generated sample exports where applicable.
- Integration status marked as simulated, provider-sandbox verified, or production verified.
- Remaining blockers and the next phase.

A feature is done only when its UI, API, persistence, permissions, audit, validation, unhappy paths, tests, and applicable docs are complete. A release is locally qualified only after clean setup and the full applicable suite. It is production-ready only after the separate GCP and human-readiness gates.

## 10. Recommended approval

Approve this as the **full v1 scope and phased execution approach**, with native creation reserved for replit.com, vendor/device/CMS checks tracked as explicit gates, and GCP provisioning/deployment requiring later approval.

The first implementation commitment is Phase 0 and the working design-system/shell checkpoint in Phase 1, not a claim that the whole platform can be safely delivered in a single uninterrupted build. Re-estimate effort and sequencing after the foundation exposes actual environment and vendor constraints. The specification's approximately 22-week placeholder is not a verified estimate for this execution.
