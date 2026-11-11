# Single-practice implementation coverage

This is the working acceptance checklist for the uploaded **Mahalo Care Platform — Build Specification v2**. A branded demonstration is not completion of the specification. Requirements remain open until their API, interface, persistence and relevant tests exist.

## Agreed changes to the specification

- One practice with multiple locations now; tenant isolation, platform support sessions and reseller administration are deferred.
- React, Node, PostgreSQL and Drizzle; email/password authentication. External identity providers and MFA are deferred.
- Native mobile, Bluetooth and HealthKit/Health Connect are a subsequent phase.
- GitHub Actions, automatic PRs, Linear and Claude Code instructions are excluded.
- Build and test locally with synthetic data. GCP deployment is a later, separately approved step.
- The supplied official Mahalo logos, fonts and current brand guide supersede the older visual palette in the PDF.
- No claims submission, diagnosis, autonomous treatment or EHR write-back.

## Acceptance inventory

| Specification | Implemented coverage | Remaining work |
| --- | --- | --- |
| 0, 3–4: foundation and portability | React/Node/PostgreSQL/Drizzle; explicit schema/guard installation rather than startup DDL/seeding; table/trigger/index readiness; portable single-port build; embedded or standalone durable worker, health, heartbeat and shutdown | Approved target migrations, least-privilege identity configuration and independent restore/load qualification |
| 5, 13: identity and access | Email/password, invitations/recovery, session revocation, lockout and 15-minute staff unlock; one effective site role per session, NPI-format validation, synchronized managed clinical directory; exact-MRN one-patient four-hour read-only emergency access with reason/attestation, audit and scope restoration | External recovery delivery, verified real professional registrations; alternate authentication and multitenancy deliberately deferred |
| 6: programs and enrollment | Five families and CoCM pathway, consent, concurrency, pause/discharge; governed immutable policies; normalized condition/medication/coverage/contact/identifier tables and clinical profile editing; versioned, scope-bound caregiver grants with retained consent proof and immediate withdrawal revocation | Independent clinical/policy review and approved production terminology/eligibility feeds |
| 8: care plans | Structured editor, signing, schedules/comparison, immutable revisions, review/exact time, discharge; governed templates; retained private PDFs/source manifests; stale-edit protection; readable presentation copies preserve exact frozen sources and original evidence | Independent clinical review of clinical content and practice-specific templates |
| 8: time and notes | Global exact timer, discard/manual reasons, API/PostgreSQL overlap guards, owner/admin voids, signatures; governed structured note templates, required sections and distinct signed-note addenda; durable uncommitted-time reminders with qualified ownership and review links | Privileged production migration and load qualification |
| 9: rules | Seven expanded evaluators: LOINC/confirmation/composite BP, trend statistics, enrollment/stream grace, adherence/barriers, score items/bands/change, code-based shortfalls; guided editor, real previews, role ownership, cooldown/on-call console capture, coded resolution/note linkage and DB dedup guard | Broader therapeutic preset library, reviewed clinical defaults, richer assignment strategy and production delivery qualification |
| 9–10: workspace | Eight server-paginated scoped worklists, persistent URL/saved filters, location/assignee filters, atomic eligible bulk assignment, CoCM registry and qualified consultant review/assessment attestation, density preferences; dashboard, chart and program views; permission-filtered keyboard/mobile command palette with scoped patient search | Browser acceptance of the newer worklist flows and accessibility qualification |
| 10: admin | Settings, account/role administration (including behavioral manager and psychiatric consultant), operations, references/audit/CSV; governed templates, payer tightening and rule builder; versioned-policy/reference configuration export with integrity hash and transactional draft-only clone import; learning authoring, explicit local review, activation and archive | Fuller locations/onboarding and production recovery qualification |
| 10: patient web | Linked login, own account/password/sessions, check-ins, adherence, messages, plan, consent withdrawal; due-only tasks, staff task exclusion, contact preferences, device disconnect with care-team follow-up, monitoring stop after withdrawal and urgent-help guidance; explicit version/hash-bound learning acknowledgment, immutable reading history, content/license review gates and server-side withholding of unreviewed wording | Independent content/clinical licensing review and accessibility qualification |
| Questionnaires | Source-bound PHQ-9/GAD-7 wording, anchors/recall/safety guidance; practice-authored builder with sum/mean/lookup scoring, immutable governed versions, canonical content fingerprints, score provenance and version-separated timelines | Licensed ODI/PROMIS tables and qualified interpretation where needed; custom/practice-only instruments are not represented as clinically validated |
| Clinical demonstration data | Thirty coherent fictional longitudinal cases, 36 enrollments, normalized profiles, observations, adherence, questionnaires, care plans, notes, consent, time and provisional billing grounded in PostgreSQL; legacy/validation fixtures retained outside clinical presentation | Dataset is anchored to November 11, 2026. Do not silently shift reviewed history or portray simulated readings/communications as live vendor activity |
| 11: devices | HMAC-verified raw simulator webhook, five-minute signature replay window, assigned serial lookup, durable inbox/job, payload replay/conflict detection, unit/parameter validation, invalid retention and bounded retries/dead-letter/retry operations | Production vendor adapters/credentials and full device catalog governance; simulator remains explicitly synthetic |
| 11: EHR | Persisted read-only FHIR R4 fixture cache and viewer, exact MRN/DOB matching, explicit same-person confirmation for MRN mismatch, source/local identity hash and stale-conflict protection, non-overridable DOB conflicts, server-stamped reviewer, append-only API history and withheld pending resources | Full cache invalidation/resource coverage and recorded external fixture corpus; vendor credentials/OmniMD agreement are external dependencies |
| 11: communications | Secure messages, persisted channel preferences, patient-timezone quiet periods including overnight/DST windows, durable deferred console outbox, opt-out suppression, immediate staff/in-app bypass and simulated video | Real delivery callbacks; vendors and approved contracts are external dependencies |
| 11: documents | Officially branded retained private PDFs and readable clinical sections; pinned generations/SHA-256/frozen sources; scoped history; private supporting-PDF quarantine/release/revocation; audited bounded full-patient ZIP containing DB history, grants, audit and verified released supporting files with SHA manifest; CSV/XLSX | Production malware scanning, additional file types, approved retention and non-destructive orphan reconciliation |
| 7: billing | Five provisional families, historical months/export, respiratory RTM variant, calendar/rolling windows, exact units/sources, frozen periods/bulk approval; audited versioned enrollment policies, pinned payer-period tightening and source hashes | Independent hand-computed reconciliation and clinical/CMS/payer review; no CBT code is invented where the supplied specification does not define it |
| 12: governed AI | Five draft capabilities; verified live synthetic AI; frozen numeric source evidence, recognized-quantity checks, editable explicit human review/exception, immutable original/decision, real edit-distance and acceptance/rejection/token reporting; no automatic signature/time; lazy live-provider initialization | Broader independently labelled factual/numeric evaluation corpus and approved external-provider configuration for GCP; source quantity checks are not clinical validation |
| 13: security and operations | CSRF, validated safe exports, DB integrity guards; retained monthly access reviews, monthly audit-manifest checkpoints and scoped weekly emergency-access reviews; on-demand/scheduled private PDF/JSON archives and source/PDF/live-event verification; console notices, bounded capture and failed-job recovery | External notification delivery, approved retention and external checkpoint anchoring/WORM if required; independent security/load/recovery qualification. Snapshot chains are not a continuously chained or externally certified ledger |
| 16: local acceptance | 119 passing unit tests; actual HTTP/DB suite results and browser evidence tracked in LOCAL-ACCEPTANCE.md; portable production-mode shell/API/auth/cache smoke; real private-byte checks | Independent clinical/CMS reconciliation, performance/security qualification and formal disaster-recovery drill; do not infer complete browser coverage from API tests |
| 18: GCP | Portable one-port React/Node build, Google-ADC private-file driver, source-build scripts, upload exclusions and staging handoff in GCP-DEPLOYMENT.md; no GCP resources created | Later: approved project/region/cost plan, Cloud Run/Cloud SQL/storage/secrets provisioning, reviewed schema/object-generation migration and staging verification |

## Evidence policy

Record test commands and observed outcomes as work lands. Do not mark a feature complete based only on a successful API response or a screenshot. External vendor delivery and clinical/CMS validation must remain explicitly distinguished from local adapter tests.

## Current local verification commands

See `LOCAL-ACCEPTANCE.md` for detailed results and the explicit boundaries of local drivers.

```sh
pnpm run typecheck
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

The HTTP checks create synthetic accounts/patients, leave them inactive afterward, preserve the audit history and rehearse period close/reopen. They do not send email or contact external device vendors. The job tests also exercise invalid signature rejection, exact event replay, conflicting replay, successful normalization, invalid reading retention, bounded retry exhaustion and administrator requeue.

### Local queue decision

The build uses PostgreSQL `SKIP LOCKED` claims with transactional savepoints instead of introducing a separate Redis service. Domain effects and successful job completion commit together; a failed attempt rolls domain changes back before recording its retry. Process failure rolls the transaction back, leaving the claim available to another worker. This is a deliberate single-practice local topology, not a claim that the specification's BullMQ/Redis production deployment has been implemented.

### Approved private development document retention

The user explicitly enabled private development cloud storage. All **595 previously database-retained PDFs** were copied, read back and verified against their exact bytes/source hashes before database blobs were removed; no legacy byte rows remained. New retained PDFs use private object storage, pinned generations and metadata-only database rows. The original migration is complete; this is not a claim that only 595 documents exist after further tests.

The 1 MiB document cap, immutable database metadata, exact-byte verification, frozen source manifests, scoped/audited downloads and no-public-route design remain enforced. A read-only check verified a pinned object through the server and denied unsigned anonymous access to the corresponding cloud object. Clinical database changes and document metadata commit together only after cloud upload succeeds. A process failure after upload but before commit can leave unreferenced **private** objects; reconciliation/cleanup is not implemented and objects must not be deleted blindly.

Supporting uploads are PDF-only, at most 1 MiB, with twenty new upload tickets per account per hour and five-minute private PUT URLs. Completion rejects transport encoding before automatic decompression, checks actual size/header/EOF and a limited active-content denylist, then copies bytes to a separate immutable sealed object: an outstanding PUT cannot overwrite a released download. These are not antivirus or full PDF-parser checks. Files remain quarantined until an administrator explicitly attests known synthetic source and unscanned risk. Reject/revoke/cancel do not erase history; administrators can also reject unfinished tickets. Incoming objects remain for retry after database failure; incoming/orphan lifecycle cleanup is required.

This is not legal WORM storage, malware-scanned upload, a qualified electronic signature, independently validated clinical content or an approved production retention policy. Legacy captures explicitly do not claim original signing-time bytes. Google SDK credential-deprecation/stream-listener warnings were observed; checks passed, but no load qualification is claimed and prescribed credentials were not replaced or warnings suppressed. GCP packaging must retain the official brand assets; optional Python font conversion is build tooling, not a runtime dependency.
