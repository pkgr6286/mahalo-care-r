# Mahalo Care — local acceptance record

This is a synthetic-data, single-practice build. It is not a production-readiness certificate or a statement that every requirement in the supplied specification is complete. See `IMPLEMENTATION-COVERAGE.md` for the remaining work.

## Checks executed against this build

| Check | Observed result |
|---|---|
| Generated OpenAPI client and Zod contracts | Generated successfully; workspace library build passed |
| Workspace typechecking and production bundles | Passed for frontend, API and shared packages |
| Unit checks | 96 tests passed, including billing/policy parity, clinical rules, content review, DST-aware quiet hours, stale EHR identity/DOB protection, supporting-PDF format/encoding/size checks and exclusion of EHR/simulated events from actual patient-contact dates |
| Clinical HTTP/database suite | 78 checks passed, including plan revisions/reviews, schedule idempotence, timer discard, period close/reopen, frozen-only approval and database-level time/audit guards |
| Account/access/operations suite | 102 HTTP checks plus DB assertions passed, including one-use invitation/recovery, role/location/patient scope, CSRF, status/session invalidation, signed ingestion, replay conflict, invalid retention, retry exhaustion/requeue, preferences, disconnect and consent withdrawal |
| Browser account journey | Passed after fixing the shared password-reset rate limiter: invitation setup, restricted navigation/chart list, own sessions, password change, old-password rejection, deactivation and blocked sign-in |
| Policy/template suite | 49 HTTP checks plus DB assertions passed: review-before-publish, frozen bodies, enrollment/payer pins, required note sections, signed addenda and retirement preserving historical references |
| Clinical-rule suite | 35 HTTP cases plus DB assertions passed: confirmation windows, concurrent deduplication, cooldown, private staff notifications, critical escalation/on-call capture, coded resolution, signed-note linkage and source-reading protection |
| Worklist suite | 100 HTTP checks passed: scoped pagination/filtering, saved views, atomic eligible bulk assignment and qualified CoCM review |
| Retained document suite | 54 HTTP checks passed against private cloud retention and scoped immutable version downloads |
| Governed AI suite | 46 HTTP checks passed: numeric review, human edits, acceptance/rejection, original draft preservation and reporting |
| Workflow/configuration/learning suite | 63 HTTP checks passed: timer reminders/void ownership, draft-only configuration import, content authoring/review/withdrawal and patient content withholding |
| Contact/EHR suite | 26 HTTP checks plus DB assertions passed: quiet-hours deferral/retry/release, opt-out suppression, staff bypass, explicit identity review, stale hashes, reviewer forgery rejection, read-only cache history and DOB conflict |
| Supporting-PDF suite | 59 HTTP checks plus DB assertions passed: direct private upload, quarantine blocking, sealed copies immune to later incoming PUTs, idempotent completion, explicit demo-release attestations, stale/reviewer forgery rejection, revoke/cancel/reject unfinished uploads, cross-patient/role denials, encoding rejection before decompression, invalid-file retention, SQL immutability and no invented patient-creation contact |
| Browser clinical journey | Core journey passed: enrollment, signed plan revisions/diff/review, persistent timer, FHIR fixture and billing close/bulk approval/reopen. Cleanup exposed a patient-status enum mismatch; corrected and cleanup confirmed through the actual API |
| Browser policy-to-note journey | Passed after a preview compiler fix: grammar validation, review/attestation, publication, immutable template, required structured sections, note signature, separate addendum and retirement excluding the template from new notes |
| Browser EHR-to-AI-note journey | Passed: scoped command search, explicit identity comparison/confirmation, persisted FHIR cache, edited deterministic AI draft with original preserved, separate unsigned note, discard/restore, explicit signature and retained PDF/history. Authorized PDF returned 200/application/pdf with 45,859 bytes and PDF magic. No time records/minutes were automatically created; the fixture patient was left inactive |
| Browser learning/preferences journey | Passed at 402×874: draft/activate original global app guidance, explicit version/hash-bound patient acknowledgment retained after archive; quiet hours/channel changes survived reload, invalid clocks blocked save and disabling recovered valid clocks. Original preferences were restored, the sole test guide archived and no horizontal overflow/runtime errors observed |
| Browser supporting-file lifecycle | Passed at 402×874: patient direct signed PUT returned 200 without CORS errors; quarantine persisted and blocked download403; staff release required both initially unchecked attestations and a 20-character reason; actual link clicked and authorized bytes verified as 1,374-byte PDF with exact fixture SHA-256; revoke persisted and blocked staff/patient download403. Only the new synthetic file was retained as revoked history; no overflow/fresh runtime errors |
| Mobile public recovery screen | Captured at 390 × 844; no visible overflow or runtime error |

## Commands

```sh
pnpm --filter @workspace/api-spec run codegen
PORT=19333 BASE_PATH=/ pnpm run build
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server test:api
pnpm --filter @workspace/api-server test:access
pnpm --filter @workspace/api-server test:policies
pnpm --filter @workspace/api-server test:rules
pnpm --filter @workspace/api-server test:worklists
pnpm --filter @workspace/api-server test:documents
pnpm --filter @workspace/api-server test:ai
pnpm --filter @workspace/api-server test:workflows
pnpm --filter @workspace/api-server test:contact-ehr
pnpm --filter @workspace/api-server test:attachments
pnpm run build:portable
pnpm run test:portable
pnpm run test:private-storage
```

These HTTP suites are development rehearsals, not production health probes. They create synthetic fixtures, retain their audit trail, leave created accounts/patients inactive, retire or pause fixture policies/rules and explicitly close/reopen the demo billing month. Do not point them at production or customer data. Polling a durable job is not counted as additional rule acceptance cases.

Private-file capture can exceed a test client's three-second default. Allow at least 60 seconds for enrollment/consent, signature and PDF operations. If a client aborts, inspect the persisted state before retrying: the server transaction may have completed after the client disconnected.

## Important fixes found by verification

- Closing a period now freezes all its evidence, including retained lines for inactive patients. Repeating a close does not recalculate or leave a partial snapshot.
- Approval/rejection requires a closed period. Reopening clears dispositions before recalculation, avoiding conflicting approved code families as open-period evidence changes.
- Recovery requests and password setup have separate limits; independent invitation tokens behind one practice connection no longer share an eight-attempt ceiling. Setup retains both an IP budget and a tighter per-token budget.
- Partial patient updates are a genuine PATCH contract. Front desk can edit permitted demographics, but cannot inject diagnoses, medications or clinical status through that endpoint.
- Scheduled care-plan revisions cancel pending prior-version tasks while preserving history. Patient sessions cannot see or complete care-team review tasks, future tasks, cancelled tasks or monitoring submissions after consent withdrawal.
- Time protection is installed in PostgreSQL as a transactional guard as well as in API workflows. Duplicate running timers and overlapping committed patient/user intervals are rejected even by direct SQL writes; the local suite rolls those direct-write attempts back.
- Reviewed policy bodies cannot be overwritten, including through direct SQL. Existing enrollments and already-calculated payer periods retain their selected policy references after retirement.
- The new JSON-policy evaluator matched the earlier evaluator across 1,200 boundary scenarios. This is a regression/parity corpus, **not independent CMS or payer reconciliation**.
- Configured rules now own BP decisions instead of an unrelated synchronous hardcoded shortcut. The HTTP rehearsal waits for the durable rule job and verifies one open exception. PostgreSQL also enforces that invariant.
- Generic record PATCH accepts partial updates without losing a revision's title/narrative. Source observations cannot be overwritten through that endpoint.
- Preview instrumentation broke explicit generic JSX even though TypeScript passed. The affected tabs now use inference; the actual publication/signature browser flow passed afterward.

## Honest local-driver boundaries

- FHIR context is a persisted synthetic R4 fixture cache with MRN/DOB matching and explicit, stale-safe manual identity confirmation. DOB conflicts cannot be overridden. It is not a live EHR connection or write-back.
- Device events use an actual signed raw-body webhook, inbox and durable worker, but the vendor is a synthetic simulator.
- Notifications are captured, suppressed or deferred locally according to channel preference and patient-timezone quiet hours; email, SMS, push and on-call delivery are not sent. Staff/in-app contact is not delayed by patient quiet hours.
- Video remains a stub. No simulated video event qualifies as interactive billing evidence.
- Billing codes and thresholds remain provisional demo defaults pending independent clinical/CMS/payer review. No claims are submitted.
- Native mobile, multitenancy, alternate identity providers and **GCP** provisioning remain outside this build phase.
- Private development storage was approved and enabled. Signed/consent/billing PDFs retain exact private bytes with pinned generations and immutable metadata; 595 legacy PDFs were migrated/read-verified and their PostgreSQL blobs removed. Supporting-PDF uploads now seal into quarantine and require explicit unscanned-demo release. Other upload types, production malware scanning and private incoming/orphan lifecycle cleanup are not implemented.
- The production frontend bundle still has a non-blocking size warning. Production performance, least-privilege migrations, backups/restore and GCP rollout remain to be qualified.
