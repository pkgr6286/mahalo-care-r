# Mahalo Care — local acceptance record

This is a synthetic-data, single-practice build. It is not a production-readiness certificate or a statement that every requirement in the supplied specification is complete. See `IMPLEMENTATION-COVERAGE.md` for the remaining work.

## Current API/build checks and retained browser evidence

Latest completion pass: **119 unit tests and 823 HTTP checks across all 15 suites passed locally**, with additional PostgreSQL assertions. Browser entries from earlier work are retained below as historical evidence, not represented as a new full browser rerun. The current signed-in walkthrough is recorded separately at the end of this document.

| Check | Observed result |
|---|---|
| Generated OpenAPI client and Zod contracts | Generated successfully; workspace library build passed |
| Workspace typechecking and production bundles | Passed for frontend, API and shared packages |
| Unit checks | 119 passed, including canonical clinical fingerprints, emergency-context boundaries, governance period/digest behavior and readable clinical-document rendering |
| Core platform HTTP/database suite | 77 passed, including plan revisions/reviews, schedule idempotence, timer discard, period close/reopen, frozen-only approval and database-level time/audit guards |
| Account/access/operations suite | 102 HTTP checks plus DB assertions passed, including one-use invitation/recovery, role/location/patient scope, CSRF, status/session invalidation, signed ingestion, replay conflict, invalid retention, retry exhaustion/requeue, preferences, disconnect and consent withdrawal |
| Browser account journey | Passed after fixing the shared password-reset rate limiter: invitation setup, restricted navigation/chart list, own sessions, password change, old-password rejection, deactivation and blocked sign-in |
| Policy/template suite | 49 HTTP checks plus DB assertions passed: review-before-publish, frozen bodies, enrollment/payer pins, required note sections, signed addenda and retirement preserving historical references |
| Clinical-rule suite | 35 HTTP cases plus DB assertions passed: confirmation windows, concurrent deduplication, cooldown, private staff notifications, critical escalation/on-call capture, coded resolution, signed-note linkage and source-reading protection |
| Worklist suite | 100 HTTP checks passed: scoped pagination/filtering, saved views, atomic eligible bulk assignment and qualified CoCM review |
| Retained document suite | 54 HTTP checks passed against private cloud retention and scoped immutable version downloads |
| Governed AI suite | 46 HTTP checks passed: numeric review, human edits, acceptance/rejection, original draft preservation and reporting |
| Workflow/configuration/learning suite | 63 HTTP checks passed: timer reminders/void ownership, draft-only configuration import, content authoring/review/withdrawal and patient content withholding |
| Contact/EHR suite | 26 HTTP checks plus DB assertions passed: quiet-hours deferral/retry/release, opt-out suppression, staff bypass, explicit identity review, stale hashes, reviewer forgery rejection, read-only cache history and DOB conflict |
| Supporting-PDF suite | 60 HTTP checks plus DB assertions passed: direct private upload, quarantine blocking, sealed copies immune to later incoming PUTs, idempotent completion, explicit demo-release attestations, stale/reviewer forgery rejection, revoke/cancel/reject unfinished uploads, cross-patient/role denials, encoding rejection before decompression, invalid-file retention, SQL immutability and no invented patient-creation contact |
| Structured clinical suite | 39 passed: normalized profiles, concurrency, permissions, bounded full-chart ZIP with SHA manifest/supporting files, real progress and server-side staff idle lock |
| Caregiver suite | 44 passed: invitation, retained consent PDF, granular family scope, private file protection, message provenance, expiry, withdrawal and non-resurrection |
| Staff-site suite | 38 passed: session-specific site roles, NPI validation, qualified ownership, timer guards and account-change revocation |
| Emergency-access suite | 42 passed: exact one-patient reads, write denials, audit, separate-session isolation, timer protection, termination and server expiry |
| Governance suite | 48 passed: scoped archive/capture/verify, fixture exclusion, frozen account snapshots, directory synchronization, pinned private PDFs, pagination and live-event manifest checks |
| Deployment tooling | Portable production-mode build and one-port smoke passed; explicit integrity installer passed without creating sample users/scenarios |
| Clinical presentation evidence | 72 private readable copies matched their original source hashes and complete frozen snapshots; original consent evidence unchanged |
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

## Completion-pass signed-in browser evidence

- Normal administrator sign-in, Margaret Wilson's actual clinical profile, 82 readings, active RPM/CCM plans and signed notes rendered. A real retained note PDF download returned 200/application/pdf, 46,951 bytes and PDF magic. No existing patient was modified in that journey.
- One unique scratch patient was created through the UI. Hypertension and lisinopril 10 mg once daily were saved in the normalized profile and persisted after full reload, with real condition/medication rows confirmed through the authenticated API.
- Scoped nurse Juliet Warren switched from Garden City care manager to Huntington read-only across two tabs. Exact-MRN emergency access to Patricia Garcia restricted the roster to one patient, showed an audited banner/no site selector, permitted clinical reads and restored Huntington read-only on ending. The 402×874 roster fit without page-level horizontal overflow.
- The post-fix Huntington reload showed no Add patient control. A real current-week emergency review captured the ended synthetic coverage event, downloaded PDF/JSON and verified source/PDF/digest matches.
- November's audit checkpoint captured 30,227 actual retained events; its 3,689,183-byte JSON manifest matched the captured count. Source, private PDF, digest and audit-chain checks all matched, with zero changed/missing events and newer/unlisted events separately identified outside the checkpoint.
- Governance archive filters and pending controls worked. Five reports fit one page, so next-page controls correctly were not rendered; API pagination has separate HTTP coverage. At 402×874, report controls/archive were accessible without page-level horizontal overflow. Initial unauthenticated auth/me401 and canceled navigation requests are not treated as runtime crashes.
- The caregiver portal showed only Margaret and the four granted capabilities. One intentional original family message persisted after reload and appeared in the staff thread with **Laura Wilson · family caregiver** attribution. A real browser download returned the shared 51,058-byte PDF; after the fixes below there was no popup or staff-preferences403 in caregiver context.
- The original practice-only walking questionnaire was created, previewed with five 0–4 anchors and Average scoring, saved, reloaded and source-reviewed through the UI. The approved definition continued to state that it was not clinically validated by the app. One browser capture wait timed out after the successful PATCH200; fresh login and API logs confirmed the committed state rather than duplicating the write.
- Final presentation cleanup retained four browser validation entities outside clinical views without deleting their history. Thirty individual patient conversations now match their fictional case concerns; the accepted family message was preserved. One inherited inhaler narrative in the heart-failure case was corrected, with two new signed revisions and the original evidence retained. Database checks confirmed 30 clinical patients, 36 current clinical plans/notes, 75 time records with unchanged durations and no inherited inhaler wording in that current case.
- After the final narrative/source changes, all library/API/frontend type checks, the portable build/smoke and the 63-case workflow suite passed again. The synthetic-refresh repeat check made zero narrative/signature changes after fixing its current-version selection; its one rejected superseded-ancestor draft was retained outside clinical presentation. The API correctly refused a parallel signed branch.

## Important fixes found by verification

- Current completion-pass browser checks found raw staff activity/unlock requests missing the browser CSRF proof. The shared JSON/operations requests and session-lock mutations now use the current cookie proof without weakening server checks. Real trusted activity and password unlock subsequently returned 200, including the visible idle-lock overlay; sign-out-while-locked also returned 200.
- The same pass found an enabled Add patient control in read-only contexts. The create control and dialog now require patients.write; the entire synthetic-reading input panel requires devices.write. The Huntington read-only reload verified Add patient absent. Backend one-patient/write denials already passed independently.
- Caregiver context no longer requests staff-only saved-view preferences. Its plan PDF control uses the authenticated downloader with pending/error handling instead of a popup. Staff conversation bubbles now display their recorded author, including explicit caregiver provenance, and order/display the clinical message timestamp rather than the later synthetic database-preparation timestamp.

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
