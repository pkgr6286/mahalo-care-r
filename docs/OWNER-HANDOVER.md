# Mahalo Care — owner handover

Single-practice platform · React, Node.js, PostgreSQL and Drizzle · November 11, 2026

## What you can show now

The platform has working staff, patient and consent-scoped caregiver web experiences. Its clinical views use persisted PostgreSQL data, not screen-only mock responses. The curated practice contains 30 fictional patients and 36 clinical enrollments across RPM, RTM, CCM, PCM and BHI, including concurrent RPM/CCM examples. CoCM has its own registry and qualified review workflow.

The cases include distinct birth dates, clinically related diagnoses and medications, coverage, contact relationships, longitudinal readings, adherence, questionnaires, plans, notes, consent, work and provisional billing evidence. Legacy and regression fixtures remain retained outside normal clinical presentation. The dataset is anchored to November 11, 2026; select November 2026 when demonstrating billing. Historical reviewed evidence is not silently shifted forward.

A scoped database check found 639 clinical observations, 90 questionnaire responses, 36 care plans, 36 notes, 75 time records and 198 provisional billing rows for this cohort. Counts exclude retained legacy/test records; a raw SQL join without the clinical dataset filter can include historical duplicates.

The official Mahalo logos, Victor Serif and Noto Sans Mahalo assets are used throughout. New clinical PDFs render readable clinical sections rather than raw metadata. Seventy-two presentation copies preserve the exact frozen source hashes and source snapshots of their originals. Earlier bytes and consent evidence remain unchanged.

## Recommended demonstration

1. For a doctor-first walkthrough, sign in as provider@mahalo.care with the shared synthetic password. For practice setup and governance, use staff on the sign-in screen, then Sign in. The helper fills credentials; it does not bypass authentication.
2. Begin with Today and an exception or due follow-up. Show why the patient needs attention, the assigned professional and the actual persisted source.
3. Search Margaret Wilson, MC-1001, Garden City. Review her RPM trend, clinical profile, medications, contacts, care plan, note and retained PDF. Show concurrent CCM evidence without implying that one activity can be billed twice.
4. Use Barbara Anderson, MC-1007, for RTM; Nancy Lee, MC-1013, for CCM; Betty Robinson, MC-1019, for PCM; Carol Wright, MC-1025, for BHI. Use the program view to compare trajectories and due work.
5. Explain the reviewed questionnaire version, source and scoring, not only a score. Public PHQ-9/GAD-7 content and practice-authored instruments are distinguished. Practice-only instruments are not represented as validated clinical tools.
6. Demonstrate a draft, its required sections, explicit signing and the retained PDF/history. Revisions and addenda preserve original evidence. AI drafts never silently sign records or manufacture time.
7. Show documented time and November billing evidence, including unmet requirements and provisional status. Do not describe estimated eligible charges as paid revenue or transmitted claims.
8. Sign out and use the patient and caregiver choices. Patient choices cover monitoring, rehabilitation and mood care. Caregiver access shows only the patient and sections granted by retained consent.
9. Use scoped nurse: Juliet Warren RN has care-manager access at Garden City and read-only access at Huntington. Switch sites to demonstrate the actual role change. For emergency coverage, use exact MRN MC-1003, Patricia Garcia, Massapequa, an honest synthetic-training reason and the attestation. Access is one-patient, read-only, audited and capped at four hours or the remaining session lifetime. End it and show restored ordinary access.
10. Return as staff administrator. In Access governance, capture a current-week emergency-access review, open the retained PDF/JSON and verify it. Show the monthly access review and audit checkpoint, with the limitations below.

The shared public synthetic password is MahaloDemo2026!. Staff administrator is demo@mahalo.care; provider is provider@mahalo.care; clinical administrator is clinicaladmin@mahalo.care. Prefer the sign-in screen's patient/caregiver selectors so the correct linked identity is used. Never reuse these public accounts or passwords for real clinical use.

Laura Wilson's fictional example was explicitly configured through the ordinary staff clinical-profile and consent-grant APIs, with a newly retained sharing-consent PDF. Her example permits care-plan/readings viewing and secure-message reading/sending only. Other contacts remain deny-by-default; program enrollment consent is never reused as caregiver-sharing permission.

## Implemented clinical and operational coverage

- Normalized condition, medication, coverage, contact and identifier editing with persisted provenance and concurrency checks.
- Enrollment, eligibility and consent, program concurrency, pause/discharge, governed clinical policies and immutable versions.
- Structured plans and notes, clinical review, signatures, revision/discard/addendum workflows and retained private PDFs.
- Exact running/manual time, overlap protection, ownership checks, void reasons, qualified review and uncommitted-time reminders.
- Metric-specific monitoring trends, adherence, source-bound questionnaires, scored outcomes and version-separated histories.
- Guided rule configuration, real-source previews, deduplicated exceptions, escalation, resolution and qualified assignment.
- Eight scoped, paginated worklists, filters, bulk assignment, consultant review, program workspaces and command search.
- Patient web check-ins, secure messaging, preferences, learning acknowledgment, device disconnect and consent withdrawal.
- Caregiver invitations, relationship/authority review, seven granular sharing scopes, frozen consent proof, expiry and revocation.
- Provisional CPT evidence, pinned enrollment/payer policy, historical periods, approval, close/reopen and export.
- HMAC-verified simulator intake, replay/conflict checks, durable jobs, bounded retries, dead-letter visibility and operator retry.
- Read-only FHIR fixture matching/cache, explicit identity confirmation and stale-conflict protection; no live EHR write-back.
- Reviewed AI drafting, preserved original/source evidence, explicit human decisions and usage reporting.
- Private supporting-PDF upload, quarantine, explicit unscanned-synthetic release, rejection/revocation and audited patient ZIP export.
- One session-site role, account/site-role administration, managed clinical directory, idle lock, emergency read-only access and retained governance reports.
- Durable worker, heartbeats, health/readiness, graceful shutdown, one-port production build and explicit database guard installation.

## Verification

The current local acceptance run passed all 119 unit tests and 823 real HTTP checks across 15 suites, with additional PostgreSQL assertions. These cover authentication, roles, staff-site contexts, emergency access, normalized clinical editing, consent/caregiver scope, policies/templates, rules, worklists, documents, AI review, jobs, communications, EHR fixtures, attachments and governance reports.

The signed-in browser walkthrough also verified profile save/reload, staff unlock, two-tab role changes, one-patient emergency access, governance downloads and verification, scoped family PDF/message access, and original questionnaire authoring/review. Final data review replaced repeated inbox boilerplate with 30 case-specific patient conversations and corrected one inherited heart-failure narrative through new signed revisions while preserving the originals. These are fictional scenarios, not evidence that actual patient care occurred.

The portable production-mode build and single-port smoke passed: React/deep routes, API isolation, anonymous denial, health, hashed-asset caching, missing assets and the official logo. The explicit integrity installer passed locally without creating sample accounts or clinical scenarios. All three scheduled governance-report jobs completed after operator retry; failed-attempt history was retained.

Detailed signed-in browser outcomes are recorded in LOCAL-ACCEPTANCE.md. Browser checks and API checks are separate evidence; neither is clinical certification, a penetration test or a load/recovery qualification.

## Database and files

The development schema is created, not merely described: twenty application tables, normalized clinical/caregiver/dataset structures, required integrity functions/triggers and declared critical indexes. Startup checks required schema; it does not install DDL or seed patients/accounts.

Clinical record metadata and frozen document source snapshots are in PostgreSQL. Current private document bytes are in approved private development cloud storage with pinned object generations, SHA-256, size checks and protected metadata. Supporting PDFs remain quarantined until an authorized explicit release; no production malware scan is claimed.

Full-patient ZIP exports use a bounded, consistent database snapshot and verified authorized files with a checksum manifest. They fail rather than return an incomplete archive when limits or evidence checks fail.

## Governance reports — what verification means

Monthly access reviews are account-assignment snapshots as captured, not reconstructed historical role assignments. Weekly emergency-access reviews are scoped to the reviewer and normally exclude retained legacy/test identities. Root administrators can explicitly include those identities.

Monthly audit checkpoints cover the captured retained event set, including retained verification history. Ordered per-event digests and a snapshot chain detect changed/missing captured rows; later events outside that captured set do not invalidate it. Capture is bounded at 50,000 events and fails explicitly rather than issuing a partial checkpoint.

Report verification checks frozen source/digest and pinned private PDF bytes; audit reports additionally compare the original event set. This is not a continuously chained insert-time ledger, external timestamp anchor, legal WORM service, qualified signature or compliance certification. Scheduled notices currently use the console driver, not actual external email.

## Deliberately deferred

- Multitenancy, cross-tenant support and tenant isolation.
- Native mobile applications, Bluetooth pairing and mobile-specific authentication.
- Alternate authentication, SSO and MFA.
- Formal WCAG qualification, as requested.
- Live EHR/device/vendor messaging/video/claims connections and production malware scanning.
- GCP resource provisioning, production database/object migration and a live GCP acceptance run.

Adapters, fixtures, simulators and console delivery are explicitly labelled. Vendor onboarding needs contracts, mappings, callback behavior and qualification as well as credentials; it is not honestly reduced to adding keys.

## What I need from you before real clinical use

- Practice identity, legal entity, addresses, site time zones/hours, branding approval and the intended demonstration audience.
- Actual staff roster, professional roles and site permissions; verified professional/group NPIs and licensure; coverage and escalation ownership.
- A clinician responsible for approving eligibility, clinical defaults, care-plan/note templates, thresholds, crisis guidance, consent wording and caregiver authority.
- Approved questionnaire wording, translations, permissions/licences and scoring tables, particularly ODI/PROMIS or any other restricted instrument.
- Payer contracts/fee schedules and a qualified coding owner to reconcile hand-calculated examples, concurrency, service windows and current-year CMS/payer rules. Provisional results are not claims acceptance.
- Privacy/security owners, agreements/BAAs, retention/deletion/legal-hold policy, minimum-necessary role review, access-review cadence and security incident ownership.
- Vendor decisions and approved sandbox accounts: EHR/FHIR resource coverage and identity rules; device serial/metric/unit mappings; communications consent/callbacks; video; claims/clearinghouse; malware scanning; approved AI processing.
- GCP project/billing approval, permitted region, budget ceiling, domain/access model and deployment owner.
- Recovery objectives, Cloud SQL backup/PITR policy, restore-test approval, private bucket retention/versioning and monitoring/on-call routing.
- Production acceptance approval after clinical, security, load, recovery and vendor qualification.

Do not paste secrets into chat or commit them. Connect supported services securely; store runtime credentials in workspace Secrets or the approved GCP Secret Manager. No external credentials are needed to run the current synthetic workflows.

## Publishing and GCP next steps

The existing private Replit deployment is https://mahalo-care-demo.replit.app. The current local acceptance evidence does not prove that its older published build contains these latest changes: republish the verified revision. No GCP resources have been provisioned by this work.

Republishing code is not evidence that the latest development data was copied to the production database. Check the published practice's dataset status separately. For a synthetic instance, the administrator's explicit practice-preparation action is available with its confirmation phrase; do not run it against real patient data or assume startup performs it. The explicitly configured Laura Wilson sharing example is separate consent data and must also be prepared/migrated through an approved process on a different database.

Replit's optional current-development-data publishing choice overwrites existing production data. Do not select that option without checking the target, taking an appropriate backup and giving explicit approval. Prefer a reviewed, non-destructive preparation/migration plan. Official explanation: https://docs.replit.com/features/data-and-storage/publish-database-changes

For GCP, first approve project, region, cost and access. Then provision staging Cloud SQL, a private bucket, service identities/secrets and the runtime; install reviewed schema/guards with a migration identity; migrate data and exact private bytes with verified new object-generation pins; run the worker continuously; test role/consent/retry/restore and clinical reconciliation before rollout.

The repository includes a portable build/start path and GCP-DEPLOYMENT.md. Installing software successfully is not evidence that the cloud permissions, contracts, data migration, backups or clinical process have been qualified.

## Local operation

Use pnpm run build:portable and pnpm run test:portable for the production-mode build/smoke. Use pnpm --filter @workspace/api-server test for units and pnpm --filter @workspace/api-server run test:local for all HTTP suites against the running local API. Tests preserve history and quarantine their own fixtures outside the clinical presentation.

For an explicitly confirmed target with the reviewed Drizzle tables already applied, use node artifacts/api-server/dist/install-integrity.mjs --approve-integrity-install with the migration identity, never as web startup. Use a separate least-privilege runtime identity. See WORKER-OPERATIONS.md for embedded/standalone worker configuration.

GitHub destination: https://github.com/pkgr6286/mahalo-care-r. Verification is local; no GitHub Actions or automatic PRs are part of this delivery.
