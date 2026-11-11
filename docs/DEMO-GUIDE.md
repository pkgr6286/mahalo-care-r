# Mahalo Care — single-practice demo

## Scope

This build follows the requested React / Node / PostgreSQL / Drizzle stack and intentionally omits multi-tenancy, native mobile, GitHub Actions, automatic PRs and third-party authentication providers.

This guide describes the running local build, **not a declaration that the entire specification is complete**. See `docs/IMPLEMENTATION-COVERAGE.md` for the current acceptance inventory and unresolved gaps.

**Synthetic data only.** Do not enter, import or upload real patient information. The running environment is not represented as HIPAA-ready, clinically validated, reimbursement-certified or production-qualified.

## Sign in

The sign-in page has **Use staff** and **Use patient** buttons that populate the public synthetic demo credentials. These are intentionally demo accounts, not production secrets.

- Staff: care-team workspace across the practice.
- Patient: a separate email/password account restricted by the server to one linked patient.

Use the patient account to demonstrate actual scope enforcement, not just the staff phone preview. The native app is deferred; the responsive patient web app and network-only PWA are available now.

## Suggested demo

1. **Today:** review practice counts and open exceptions. Open Search or press Cmd/Ctrl+K to find an in-scope patient by name/MRN or a permitted page.
2. **Patient chart:** review enrollments, consent, plan, readings, tasks, interactions, time and notes.
3. **Device event:** simulate a high blood-pressure reading in the staff chart. Repeated signals update one active critical exception. Invalid measurements remain visible as invalid rather than silently contributing to billing.
4. **Care plan:** edit a draft, provide goals and interventions, sign it, open its generated PDF, then revise it. A signed record is not overwritten; the revision needs a new signature.
5. **Worklist:** acknowledge, resolve or dismiss an exception with the required reason.
6. **Time:** use an eligible activity and real start/end values. Overlapping staff intervals are rejected. Secure messages alone do not satisfy a live two-way interaction.
7. **Assist:** create a deterministic draft without an external request, or explicitly choose Live AI and confirm synthetic data. Review and accept or reject it. Accepted notes remain unsigned; time suggestions do not commit minutes.
8. **Billing:** calculate provisional evidence, inspect blockers and sources, close the period, approve/reject frozen candidates, export CSV/XLSX and reopen only with a reason.
9. **Admin:** preview a rule against a patient; inspect the immutable audit feed; validate a synthetic patient CSV before importing; inspect the console-only notification outbox.
10. **Patient sign-in:** complete a check-in, report medication or exercise completion, send a secure message, view the signed plan and withdraw consent. Withdrawing consent pauses the active program.
11. **EHR identity:** refresh the synthetic FHIR fixture. Use Demo identity mismatch to demonstrate the comparison table, explicit same-person checkbox and review reason. No new clinical resources link while confirmation is pending; a DOB conflict cannot be overridden.
12. **Learning:** in Admin → Learning, create original nonclinical app guidance as a draft, then activate it. Clinical wording additionally needs source/license information and an explicit local review. The patient reads actual content and explicitly acknowledges its frozen version; this is not a comprehension or billable-time claim.
13. **Contact preferences:** in the patient account, change channels and quiet hours, save and reload. Times use the patient's recorded timezone. Patient email/SMS/push console captures wait, while in-app messages and staff alerts do not.
14. **Operations:** inspect durable jobs, console notifications and stale/uncommitted timer reminders. Configuration exports exclude patients and credentials; imports verify integrity and create new drafts, never overwrite or auto-publish.
15. **Supporting files:** patient Plan or staff chart Files accepts a private PDF up to 1 MiB. Upload seals into quarantine with no Download. An administrator may explicitly release a known synthetic test file after acknowledging it is unscanned, or reject/revoke it; the original uploader can cancel unfinished/quarantined files. This does not create signed notes, clinical approval or billing evidence.

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
pnpm run typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server test:api
pnpm --filter @workspace/api-server test:access
pnpm --filter @workspace/api-server test:contact-ehr
pnpm --filter @workspace/api-server test:attachments
pnpm run build:portable
pnpm run test:portable
```

`test:api` exercises real HTTP endpoints and the PostgreSQL database. It creates an explicitly named workflow-test patient and marks that patient inactive afterwards, preserving the audit history. It tests authentication denial, patient scope, enrollment conflicts, document revisions, PDF signatures, exception state, scoring validation, overlap rejection, adherence idempotency, draft acceptance, exports, import validation, billing close/reopen and database-level audit immutability.

These checks are **not browser end-to-end tests**, independent clinical validation or an external penetration test. The screenshot tool can check the public sign-in page but cannot sign in, and there is no authentication bypass.

### Results from this build

- Full workspace TypeScript checks passed.
- Production bundles for the API and web application built successfully. The frontend emitted a bundle-size warning, not a build failure.
- 96 unit tests passed, including rule/policy parity, content review, DST-aware quiet periods, stale-safe EHR matching, supporting-file encoding/size checks and truthful patient-contact dates.
- 612 HTTP checks passed: 78 clinical, 102 access, 49 policy/template, 35 rules, 100 worklists, 54 retained documents, 46 AI, 63 workflow/configuration/learning, 26 contact/EHR and 59 supporting-file cases, with additional database assertions.
- The new invitation, location/role restrictions, password change and deactivation journey passed in a real browser. See `LOCAL-ACCEPTANCE.md` for the full current record.
- One live AI drafting request succeeded and saved a source-linked draft in pending-review status.
- Signed-in account, core clinical, policy-to-note and EHR-to-reviewed-AI-note/PDF journeys were browser-tested. The newer guided rule/worklist screens have API/unit coverage; broader browser interaction coverage remains pending.
- Mobile patient learning/preferences and patient→staff→patient supporting-file quarantine/release/download/revoke journeys passed at 402×874, including direct cloud PUT CORS, exact PDF hash and blocked revoked downloads. Patient creation/EHR refresh/simulation no longer appear as actual contact.

## Important limitations and next production gates

- No multi-tenant isolation or tenant administration.
- No native iOS/Android application, push-delivery registration, app-store builds or offline health-data storage.
- The Staff directory remains reference data; the separate Accounts tab now creates actual staff/patient sign-in accounts. Invitations, one-use recovery links, password changes, session revocation, five-failure lockout and API role/location controls are implemented. MFA and break-glass remain deferred; recovery is a local administrator handoff, not outbound email delivery.
- EHR synchronization uses fixtures. Video creation does not create a real conference. Email/SMS/push are captured by a console adapter, not delivered. The signed simulator and its durable retry queue work locally; live vendor connections/delivery callbacks and approved contracts are not configured.
- AI is an optional **synthetic-data-only development connection**, not a production PHI route. No BAA, Vertex deployment or production clinical-agent authorization is implied.
- Instrument counts/ranges and scores are implemented; licensed/validated questionnaire wording is not supplied. Neutral item labels are not a substitute for approved clinical content.
- Billing policies are provisional demonstration defaults, not an authoritative current-year payer determination. Historical month selection, respiratory RTM evidence, bulk approval, governed versioned policies and payer tightening are implemented. Independent clinical/CMS/payer review and hand-reconciled fixtures remain required. No CBT supply code has been invented beyond the supplied specification. There is no claims submission or adjudication.
- A durable PostgreSQL worker runs queued rule evaluation, sweeps, task scheduling, quiet-hour-aware console notifications and signed simulator ingestion, with bounded retries and administrator dead-letter requeue. A validated real on-call delivery chain and production operational qualification remain open.
- Signed, consent and billing PDFs retain exact bytes in private development storage, with pinned generations, SHA-256/source manifests and scoped audited downloads. The 595 legacy PDFs were migrated/read-verified before their PostgreSQL blobs were removed. Supporting PDFs upload directly to private storage, seal separately and stay quarantined until explicit unscanned-demo release. Other file types, production malware scanning and incoming/orphan cleanup remain unimplemented.
- The development database uses owner-level bootstrap permissions and a demo-scale advisory lock. Production needs reviewed migrations, least-privilege service roles, backup/restore drills, disaster recovery and load/security qualification.
- GCP infrastructure has not been provisioned or deployed. Deployment should follow a separately approved environment/cost plan.

## GCP handoff direction

Preserve the current React/Node/Postgres/Drizzle code. A later deployment can target a managed Node runtime such as Cloud Run, Cloud SQL for PostgreSQL, Secret Manager, storage for retained documents, a durable job service, appropriate ingress/TLS and a separately approved AI route.

See `GCP-DEPLOYMENT.md` for the tested one-port build, Google-ADC storage driver and staging handoff. Before any real-patient rollout, agree on regions, costs, contracts/BAAs, retention, clinical content, policy ownership, recovery objectives and migration ownership; then provision and qualify staging. No GCP resources or public production release have been created. Private development storage was enabled with the user's explicit approval.
