# Mahalo Care — single-practice demo

## Scope

This build follows the requested React / Node / PostgreSQL / Drizzle stack and intentionally omits multi-tenancy, native mobile, GitHub Actions, automatic PRs and third-party authentication providers.

**Synthetic data only.** Do not enter, import or upload real patient information. The running environment is not represented as HIPAA-ready, clinically validated, reimbursement-certified or production-qualified.

## Sign in

The sign-in page has **Use staff** and **Use patient** buttons that populate the public synthetic demo credentials. These are intentionally demo accounts, not production secrets.

- Staff: care-team workspace across the practice.
- Patient: a separate email/password account restricted by the server to one linked patient.

Use the patient account to demonstrate actual scope enforcement, not just the staff phone preview. The native app is deferred; the responsive patient web app and network-only PWA are available now.

## Suggested demo

1. **Today:** review practice counts and open exceptions, then open a patient.
2. **Patient chart:** review enrollments, consent, plan, readings, tasks, interactions, time and notes.
3. **Device event:** simulate a high blood-pressure reading in the staff chart. Repeated signals update one active critical exception. Invalid measurements remain visible as invalid rather than silently contributing to billing.
4. **Care plan:** edit a draft, provide goals and interventions, sign it, open its generated PDF, then revise it. A signed record is not overwritten; the revision needs a new signature.
5. **Worklist:** acknowledge, resolve or dismiss an exception with the required reason.
6. **Time:** use an eligible activity and real start/end values. Overlapping staff intervals are rejected. Secure messages alone do not satisfy a live two-way interaction.
7. **Assist:** create a deterministic draft without an external request, or explicitly choose Live AI and confirm synthetic data. Review and accept or reject it. Accepted notes remain unsigned; time suggestions do not commit minutes.
8. **Billing:** calculate provisional evidence, inspect blockers and sources, close the period, approve/reject frozen candidates, export CSV/XLSX and reopen only with a reason.
9. **Admin:** preview a rule against a patient; inspect the immutable audit feed; validate a synthetic patient CSV before importing; inspect the console-only notification outbox.
10. **Patient sign-in:** complete a check-in, report medication or exercise completion, send a secure message, view the signed plan and withdraw consent. Withdrawing consent pauses the active program.

## Implemented surfaces

- Shared patient chart for RPM, RTM, CCM, PCM and BHI, with enrollment constraints.
- Persistent session cookies and password hashing; server-enforced patient resource scoping.
- Versioned care plans/notes, signature actions, consent capture/withdrawal and generated PDFs.
- Structured measurements, replay checks, basic validation and exception deduplication.
- Seven rule kinds: threshold, trend, missing data, adherence, score, time-budget risk and device-day risk.
- Tasks, fourteen-day plan task generation, standardized-instrument scoring skeletons and daily idempotent adherence.
- Persistent timers, exact-duration accounting, interval-overlap prevention, void reasons and closed-period locks.
- Provisional five-program billing code families, distinct calendar-management and rolling 30-day supply evidence, whole-block add-ons, setup/supply repeat protection, close/reopen and human disposition.
- Secure in-app messages and interaction history.
- Explicit simulated EHR, video and outbound notification adapters; console notification outbox.
- Configuration management, configuration JSON export/import, patient CSV validation/import and CSV/XLSX data exports.
- Optional OpenAI drafting through Replit AI Integrations, plus deterministic test mode; source IDs, prompt version, usage, review warnings and acceptance trail.

## Run and verify locally

The managed API and web workflows must both be running.

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm run typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server test:api
PORT=5000 BASE_PATH=/ pnpm run build
```

`test:api` exercises real HTTP endpoints and the PostgreSQL database. It creates an explicitly named workflow-test patient and marks that patient inactive afterwards, preserving the audit history. It tests authentication denial, patient scope, enrollment conflicts, document revisions, PDF signatures, exception state, scoring validation, overlap rejection, adherence idempotency, draft acceptance, exports, import validation, billing close/reopen and database-level audit immutability.

These checks are **not browser end-to-end tests**, independent clinical validation or an external penetration test. The screenshot tool can check the public sign-in page but cannot sign in, and there is no authentication bypass.

### Results from this build

- Full workspace TypeScript checks passed.
- Production bundles for the API and web application built successfully. The frontend emitted a bundle-size warning, not a build failure.
- 30 billing, time, rules and calendar/supply-period unit test groups passed.
- 59 real API/database workflow checks passed.
- One live AI drafting request succeeded and saved a source-linked draft in pending-review status.
- The public sign-in page was visually inspected. Signed-in clinician/patient screens were not browser-tested.

## Important limitations and next production gates

- No multi-tenant isolation or tenant administration.
- No native iOS/Android application, push-delivery registration, app-store builds or offline health-data storage.
- The staff directory is not a staff-account provisioning system. Fine-grained staff RBAC, account recovery, password changes, MFA, lockout policies and emergency access workflows need further work.
- EHR synchronization uses fixtures. Video creation does not create a real conference. Email/SMS/push are captured by a console adapter, not delivered. Real vendor webhooks, credentials, retry queues and contract tests are not connected.
- AI is an optional **synthetic-data-only development connection**, not a production PHI route. No BAA, Vertex deployment or production clinical-agent authorization is implied.
- Instrument counts/ranges and scores are implemented; licensed/validated questionnaire wording is not supplied. Neutral item labels are not a substitute for approved clinical content.
- Billing policies are provisional demonstration defaults and not an authoritative current-year payer determination. There is no claims submission or adjudication. Respiratory/CBT RTM variants, historical-period workflows, payer-specific edits and complete audit-certified reconciliation require further implementation and expert review.
- Rules can be evaluated on demand and critical BP ingestion is evaluated immediately. There is no durable distributed background scheduler, Redis/BullMQ worker, dead-letter recovery system or validated on-call delivery chain.
- PDF artifacts are generated on demand, not retained in object storage with lifecycle/version policy. There is no complete attachment upload/scanning/retention workflow.
- The development database uses owner-level bootstrap permissions and a demo-scale advisory lock. Production needs reviewed migrations, least-privilege service roles, backup/restore drills, disaster recovery and load/security qualification.
- GCP infrastructure has not been provisioned or deployed. Deployment should follow a separately approved environment/cost plan.

## GCP handoff direction

Preserve the current React/Node/Postgres/Drizzle code. A later deployment can target a managed Node runtime such as Cloud Run, Cloud SQL for PostgreSQL, Secret Manager, storage for retained documents, a durable job service, appropriate ingress/TLS and a separately approved AI route.

Before any real-patient rollout, agree on regions, contracts/BAAs, retention, clinical content, code-policy ownership, role model, recovery objectives and migration ownership; then implement deployment configuration and run staging qualification. No cloud resources, paid infrastructure or public production release have been created by this build.
