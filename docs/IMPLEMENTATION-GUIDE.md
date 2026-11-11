# Mahalo Care — Practice implementation guide

Single-practice edition · 11 November 2026

## 1. Purpose, scope and how to use this guide

Use this guide to introduce Mahalo Care into one practice, from an empty patient roster through a controlled launch. It is written for the practice owner, implementation lead, administrator, clinical lead, billing lead and technical operator.

This is the **setup and rollout playbook**. The companion **Practice and care-team user guide** explains individual screens and daily tasks. The technical deployment and worker documents explain hosting and infrastructure. None replaces the others.

**Current workspace: synthetic patients only. Do not enter real patient information.** This guide provides a path to evaluate the implemented product and a separately gated path toward real-patient operations. It does not declare that the latter is approved.

An empty-practice starting point is a documentation scenario, not an instruction to clear the existing workspace. Preserve its fictional patients, signed records and audit history. Ask the operator for a separate environment when an actually empty roster is needed.

### Choose the launch you are implementing

| Launch track | Permitted starting point | Completion means |
| --- | --- | --- |
| Synthetic evaluation | Provisioned environment approved for fictional data | Named participants can complete the agreed fictional care journeys and explain what is simulated |
| Real-patient operation | Separate, explicitly approved clinical environment | Technical, clinical, privacy/security, operational and applicable billing gates are passed with recorded evidence |

Single-practice operation may include multiple locations. Independent tenants, native mobile applications, additional authentication providers and formal WCAG qualification are outside this implementation scope. They are not prerequisites for a fictional evaluation; any organizational requirement for them must be recorded before a real launch.

### The implementation sequence

1. Agree scope, owners and the launch track.
2. Receive and verify the technical environment.
3. Configure the practice, locations and access.
4. Review clinical policies, content and billing assumptions.
5. Prepare the patient roster and rehearse import.
6. Rehearse enrollment, consent and complete care journeys.
7. Train each role and record acceptance.
8. Approve the applicable launch gates.
9. Start a bounded cohort, monitor outcomes and hand over support.

Do not promise a launch date before the owners and unresolved dependencies are known. Advance on evidence, not elapsed days.

## 2. Assign accountable owners

One person can hold several responsibilities in a small practice. Each responsibility still needs a named owner and a backup.

| Owner | Accountable for | Required output |
| --- | --- | --- |
| Practice sponsor | Scope, resources, launch decision and risk acceptance | Approved implementation brief |
| Implementation lead | Sequence, dependencies, issues and acceptance coordination | Current readiness register and launch pack |
| Practice administrator | Practice setup, locations, accounts and roster import | Saved configuration and access roster |
| Clinical lead | Care pathways, eligibility, content, consent and escalation | Recorded clinical approval for intended workflows |
| Billing lead | Applicable payer rules, evidence interpretation and reconciliation | Approved billing procedure and sample reconciliation |
| Technical operator | Environment, schema, storage, worker, monitoring and recovery | Technical handover and recovery evidence |
| Privacy/security owner | Data authorization, access review, vendor terms and incident handling | Data-use decision and required security approvals |
| Care-team lead | Daily coverage, training and patient onboarding | Coverage roster and trained first-cohort team |

### Create the implementation brief

Record the practice's legal/display names, locations, timezone, intended programs, launch track, cohort size, support hours, implementation owner and desired launch window.

List the services that will be used now and those that will not. For each unavailable service, state the approved alternative or explicitly exclude the associated workflow. “We will provide a key later” is not a completed integration decision.

Choose a small first cohort that the named team can safely support. Determine its size from coverage and response capacity; the software does not prescribe a universal safe patient count.

## 3. Understand what is included and what is not

These are implemented product areas, not statements that every configuration has been independently qualified for production.

| Area | Included now | Implementation responsibility |
| --- | --- | --- |
| Identity and practice | Email/password, named accounts, site-aware roles, invitations, session controls and clinical directory | Assign real people, verify role suitability and select an approved link-delivery process |
| Patient records | Searchable/sortable panel, manual registration, Excel/CSV import and structured clinical editing | Identity quality, source reconciliation and assignments |
| Care programs | RPM, RTM, CCM, PCM and BHI workflows; CoCM registry and qualified review pathway | Choose the pathways actually offered and approve their clinical use |
| Clinical work | Consent, enrollment, plans, notes, signatures, revisions, time and private documents | Professional decisions, patient-specific content and attestation |
| Coordination | Today, eight worklists, rules, exceptions, tasks, questionnaires, learning and in-app messages | Coverage, escalation, content approval and response expectations |
| Patient/family access | Responsive patient web workspace and category-limited caregiver grants | Invitation, authority verification, explicit sharing permission and training |
| Billing and reports | Provisional evidence, blockers, review, period close/reopen, exports and governance captures | Payer interpretation, independent reconciliation and approved downstream processes |
| Operations | Durable background jobs, retries, reading inbox, private file controls and health/readiness | Continuous worker execution, monitoring, recovery and incident ownership |
| Optional AI | Source-linked drafts with explicit human review | Approved provider/data policy and accountable clinical review; no autonomous signing |

### Services that must not be described as live

EHR access uses read-only fixtures; device intake uses a simulator; video and outbound delivery use simulated/local adapters. The platform does not currently submit payer claims or provide a native mobile application. In-app messaging and the patient web workspace are distinct from external email/SMS/push delivery.

Supporting PDF uploads are quarantined. The explicit unscanned synthetic release is not production malware screening. Included policy baselines are not clinical or payer approval. Licensed questionnaire content is not supplied merely because a related workflow exists.

External services require approved contracts, identity mappings, failure handling, delivery callbacks and acceptance evidence, not just credentials. They remain separate work unless expressly included in the launch scope.

## 4. Receive the technical environment

**Owner: technical operator. Practice administrator witnesses the handoff.**

Ask the operator to deliver a usable environment before configuring patient care.

1. Identify the environment, application address, purpose, approved data class and responsible operator.
2. Confirm the deployed source revision and which database and private storage belong to it. Do not infer either from a familiar page design.
3. Confirm the reviewed PostgreSQL schema, integrity protections and critical indexes are installed. Startup checks them; startup is not the migration or sample-data installer.
4. Confirm the Node runtime, private file access and background worker are running.
5. Receive a named initial administrator through an approved private channel. There is no public first-administrator registration wizard.
6. Sign in, save a harmless practice setting, reload it and confirm persistence.
7. With fictional data, capture and retrieve an authorized private document; confirm anonymous access is denied.
8. Confirm worker heartbeat and a known scheduled job complete without a clinician pressing a maintenance button.
9. Record support ownership, monitoring route, backup scope, recovery procedure and environment change controls.

### Technical handoff record

| Record | What the operator supplies |
| --- | --- |
| Target | Environment name, address, source revision and permitted data |
| Data | Database identity without credentials; migration/guard installation outcome |
| Files | Private storage driver, retention owner and verified protected retrieval |
| Worker | Embedded or standalone topology, heartbeat and completed job evidence |
| Recovery | Database and document recovery procedure, test date and observed outcome |
| Access | Named administrator, runtime/migration privilege separation and credential custodian |
| Support | Responsible contact, monitoring destination and escalation procedure |

Never put passwords, API keys, connection strings or private invitation links in the implementation register. Record the custodian and approved configuration method instead.

The source repository includes technical references at `docs/GCP-DEPLOYMENT.md`, `docs/WORKER-OPERATIONS.md` and `docs/OWNER-HANDOVER.md`. GCP provisioning, costs, production migration and publishing require separate approval; this document does not perform or authorize them.

**Exit criterion:** the environment can persist data, protect files, process background work and provide named administrative access. Unverified recovery remains an open launch gate, not a checked box because backups are configured.

## 5. Configure the practice and locations

**Owner: practice administrator.**

1. Open **Admin → Settings**.
2. Set practice name, support email and support phone.
3. Set the practice timezone using a valid IANA value, for example `America/New_York`.
4. Review patient app display settings, quiet hours and notification preferences. A preference does not make an external delivery adapter live.
5. Save and reload to confirm persistence.
6. Open **Admin → Locations** and create each intended active location.
7. Agree the canonical location names with the person preparing the roster.
8. Record the support hours and escalation procedure in the team's operating procedure. Do not assume an address or timezone setting creates staffed coverage.

Use patient-specific timezones when needed. Practice defaults must not silently stand in for a known different patient timezone.

Do not run sample preparation or simulator controls as part of normal setup. They are optional fictional-evaluation tools, not prerequisites for a new clinical practice.

**Exit criterion:** the saved practice details and active locations match the approved implementation brief.

## 6. Configure accounts, site access and coverage

**Owners: administrator and care-team lead; privacy/security owner approves access policy.**

1. Prepare a roster of staff names, emails, professional functions, intended sites, permissions and coverage responsibilities.
2. Open **Admin → Accounts** and create named accounts with the least-privileged appropriate role.
3. Assign each person's site access. Where duties differ, assign the appropriate role at each site.
4. Review required professional credentials and identifiers against authoritative sources. Format validation is not professional registration verification.
5. Review the synchronized staff directory rather than creating duplicate people. A directory-only entry does not provide login access.
6. Generate setup links and deliver them privately to the intended recipients. Current local delivery does not prove an email was sent.
7. Have each recipient set a password and sign in. Reissue expired links; setup/reset links currently expire after one hour.
8. Verify each representative role using fictional records at an allowed and a disallowed site.
9. Assign primary and backup owners for clinical exceptions, outreach, consultant review, billing and technical failures.

### Access checks that matter

- The selected site supplies one effective session role; permissions are not the union of every role at every site.
- A billing or read-only account must not acquire clinical signing authority.
- A caregiver must not receive ordinary staff access.
- A patient account must not open another patient's record.
- Staff inactivity locking and password unlock must work for the role being used.
- Emergency access is exceptional, read-only and one-patient scoped; it is not a workaround for routine staffing or incorrect assignments.

Test emergency access only with an honest synthetic-training reason. Confirm the exact-MRN lookup, attestation, time limit, audit capture and restoration of ordinary scope when access ends.

**Exit criterion:** the access roster is approved, named users can sign in, representative permission boundaries pass and daily coverage has a backup.

## 7. Approve clinical policies and content

**Owner: clinical lead; authorized reviewers and administrators perform their permitted actions.**

Approve only the programs and content that the practice plans to use. Do not make every configuration tab a prerequisite for a limited first cohort.

### Program policies

1. Open **Policies and templates** and select the relevant **Included baseline**.
2. Review the source and stored version under **Review and version details**.
3. Choose **Clone to draft**; do not try to alter a bundled original.
4. Set a meaningful version and effective date.
5. Review eligibility, consent, monitoring/time evidence, thresholds, exclusions and applicable payer differences.
6. Save and validate. Use **Preview evidence** with suitable fictional cases.
7. An authorized reviewer records the source reference, substantive review note and attestation.
8. An administrator publishes with the required reason and confirmation.
9. Confirm the intended version is available to new enrollments.

Existing enrollments remain pinned to their original version. Publication is not a silent migration. Decide how the practice will handle a future policy change before it affects an active cohort.

### Content and escalation register

| Item | Review required before intended use |
| --- | --- |
| Care-plan and note content | Patient-specific requirements, required sections, qualified signers and revision procedure |
| Consent and caregiver sharing | Appropriate wording, consent capture, relationship/authority checks, scope, expiry and withdrawal |
| Clinical exception rules | Units, thresholds, missing-data grace, deduplication/cooldown, urgency, assignment and resolution |
| Questionnaires | Exact wording, recall period, scoring, safety response, source, licensing and version |
| Learning | Clinical wording, source/use permission, activation and patient acknowledgment |
| AI assistance | Permitted data/provider, source review, factual correction, rejection and final human responsibility |

The reference template library and governed published template versions are not interchangeable. A reference item does not automatically become a selectable approved note form. Publish the governed note template required by the intended workflow.

Public PHQ-9/GAD-7 definitions and practice-authored instruments are distinguished. Custom questionnaires are not represented as validated instruments. Do not activate restricted content without the relevant permissions and approved scoring.

For urgent clinical findings, document who responds, during which hours, through which channel and how unresolved work is escalated. The platform does not provide an emergency response service or guarantee that a notification was externally delivered.

**Exit criterion:** intended policies/content have named approval, published versions where applicable and a rehearsed response procedure.

## 8. Prepare and import the patient roster

**Owner: administrator; clinical/data owners approve the source.**

For the current workspace, use fictional patients only. Real roster preparation belongs to the separately approved real-patient environment and process.

### Prepare the file

1. Use `.xlsx` or UTF-8 `.csv`; save older `.xls` workbooks as `.xlsx`.
2. Put headers on the first non-empty row, then one patient per row.
3. Include separate first name, last name and date of birth.
4. Include an active location name, or choose an agreed default location in the importer.
5. Use `YYYY-MM-DD` text dates or actual Excel date cells. Do not rely on ambiguous date formats.
6. Store MRNs and phone numbers as Text so leading zeros survive. Replace formulas with values.
7. Use accurate optional contact, payer, care-manager and timezone values, or leave them blank. Unknown payer must not become assumed Medicare.
8. Split large rosters into batches of at most **500 patients**. Source files must be under **1 MiB** and the matched submitted CSV under **300 KB**.

The blank Excel template has **Instructions** and **Patients** worksheets. A headers-only CSV template is available in the import panel and in `docs/templates/patient-import.csv`.

### Rehearse the import

1. Open **Patients → Import patients** as an administrator. The same importer is available in **Admin → Settings**.
2. Select the file and the worksheet containing the roster.
3. Match source columns to the patient fields. Check the explicit ignored-column list.
4. Set a default active location and care manager only when appropriate.
5. Inspect the preview, especially names, dates, leading-zero MRNs, location and assignment.
6. Confirm the fictional-data requirement and choose validation.
7. Correct every row error. Changing the file, mapping or defaults requires validation again.
8. Review new-patient and duplicate counts before confirming import.
9. Import and retain the completion counts and reasons for skipped duplicates.
10. Reload **Patients** and reconcile the expected new records and identifiers.

An invalid row blocks the batch before patient creation; the importer is not an “accept the good rows and hide the rest” tool. Name/date-of-birth duplicates are identified, including within a file. Conflicting MRNs are errors, not permission to overwrite a chart.

Existing duplicates are skipped, not updated. Correct existing records through the authorized profile workflow. If a completion result is uncertain, inspect the panel and validate again before retrying.

### Reconcile clinical meaning

Imported condition and medication fields are summaries, separated by a vertical bar when multiple values are supplied. They are not verified coded diagnoses, reconciled prescriptions or proof of clinical eligibility.

**Import does not create:** patient login accounts, consent, active enrollment, caregiver grants, signed plans, device evidence, completed work or billable time.

**Exit criterion:** the source-to-panel counts reconcile, conflicts are resolved and clinical staff receive an assigned roster ready for review—not a claim that registration completed enrollment.

## 9. Rehearse enrollment and patient activation

**Owner: qualified care team, with administrator support for accounts.**

Use the first fictional patient to verify the full sequence, then repeat for each intended care pathway.

1. Open the chart and verify identity, location, timezone, contact information and care-team assignment.
2. Reconcile conditions, medications, coverage, contacts and identifiers in the structured clinical profile. Resolve contradictory imported summaries.
3. Open **Enrollment & consent** and assess the intended program's eligibility under the approved policy.
4. Explain and record the required consent. Do not treat roster presence or a portal account as consent.
5. Confirm program concurrency and avoid describing overlapping work as separately billable merely because two programs are active.
6. Create a patient-specific care plan, review its schedule and have a qualified person sign it.
7. Assign the appropriate device or patient tasks for the agreed pathway. A device inventory assignment is not proof of a live vendor feed.
8. Invite the patient to the web workspace and privately deliver the setup link.
9. Confirm the patient can view the intended plan and due tasks and complete a fictional check-in or message.
10. If a caregiver is needed, verify relationship/authority and capture separate, granular sharing permission. Test only the granted categories.
11. Rehearse withdrawal/revocation and confirm the affected access or monitoring stops as intended.

Consent for program participation is not consent for caregiver sharing. A contact entry does not automatically grant portal access.

For CoCM, include the behavioral care manager and qualified psychiatric consultant review pathway in the rehearsal. Do not assume that a BHI example alone proves consultant review.

**Exit criterion:** a complete patient journey works for each intended pathway, with actual saved consent, a patient-specific signed plan and correctly scoped access.

## 10. Establish the daily operating model

**Owner: care-team lead.** Clinical users should manage patients, not operate a job scheduler.

### The team's normal day

1. Begin in **Today** with the correct site context.
2. Review urgent exceptions and work due within the team's agreed coverage.
3. Use **Worklists** to identify assigned follow-up and unmet care requirements.
4. Open the patient, review source evidence and perform the appropriate clinical/outreach work.
5. Document actual contact, findings, time and the resolution or next step.
6. Escalate unresolved clinical concerns to the named backup/provider.
7. End the day with an explicit handoff for unresolved priority work.

### Separate automation from professional judgment

| Runs in the background when configured | Still requires a person |
| --- | --- |
| Rule evaluation and deduplicated exception creation | Interpret the finding and decide what to do |
| Scheduled task creation from signed schedules | Approve the schedule and perform/review care |
| Notification job processing and quiet-hour handling | Verify the channel is live and act on failed delivery |
| Evidence aggregation and provisional billing checks | Confirm qualifying care and approve billing decisions |
| Scheduled governance captures and job retries | Review the captures and respond to exhausted failures |

Do not tell clinicians to run maintenance daily, reload synthetic scenarios or clear failed jobs merely to make a dashboard look healthy. An operator investigates failures; clinical staff receive the impact and the safe alternative procedure.

Agree how the team detects missing readings, follows up nonresponse, handles out-of-hours concerns and records work during an outage. Any manual fallback must meet practice policy and later be reconciled without inventing timestamps, signatures or time.

**Exit criterion:** role owners can explain the daily routine, escalation and fallback without needing an administrator to operate the system for each patient.

## 11. Establish billing, reporting and governance

**Owners: billing lead, clinical lead and administrator.**

### Billing rehearsal

1. Select the intended billing period and program.
2. Review the patient's pinned policy and any applicable payer override.
3. Inspect the actual underlying consent, readings, calendar/rolling windows, interaction and time evidence.
4. Compare a sample calculation with an independent hand calculation using current applicable requirements.
5. Test a qualifying and a nonqualifying example, including overlap or concurrency where relevant.
6. Resolve blockers through truthful source records, not fabricated minutes or backdated care.
7. Rehearse approval, export, close and authorized reopen with a reason.
8. Confirm who performs the downstream claim process outside this platform.

Provisional eligibility is not payer approval, a submitted claim, payment or revenue. Store review evidence and discrepancies in the launch pack.

### Governance rehearsal

Review account/site assignments, scoped emergency-access activity, access-review captures and retained audit checkpoints. Confirm protected downloads and authorized verification.

An audit checkpoint covers its captured event set. It is not an externally anchored continuous ledger or legal WORM certification. An access snapshot is not reconstructed historical permission evidence.

Define who may export data, where exports may be stored, their retention and how accidental distribution is handled.

**Exit criterion:** the billing lead accepts sample reconciliation, and administrators can produce and interpret the intended governance evidence without overstating it.

## 12. Complete workflow acceptance

**Owner: implementation lead coordinates; the responsible role accepts each outcome.**

The existing local test record is supporting evidence, not proof that a newly deployed environment has passed these checks. Record the target environment, source revision, tester, date, outcome and evidence for this implementation.

Use fictional data for rehearsals. Never use a patient's actual record as a disposable permission or failure test.

| Check | Expected result | Accepting owner |
| --- | --- | --- |
| Persistence | Saved practice setting and patient change survive reload | Administrator |
| Access | Allowed site works; disallowed site/write/signature is denied | Privacy/security owner |
| CSV/XLSX onboarding | Correct mapping, dates and MRNs; invalid batch creates no patients; repeat import skips duplicates | Administrator |
| Clinical reconciliation | Structured profile reflects reviewed source, not unverified imported summaries | Clinical lead |
| Enrollment | Correct policy, consent and concurrency; registration alone remains unenrolled | Clinical lead |
| Plans and notes | Required content/signature enforced; revision retains earlier evidence | Clinical lead |
| Monitoring/rules | Valid fictional reading persists and appropriate exception appears; invalid input is visible | Care-team lead |
| Tasks/questionnaires | Correct due work, reviewed version/scoring and documented follow-up | Clinical lead |
| Time/billing | Actual time, overlap protections, blockers and independent calculation agree | Billing lead |
| Patient/caregiver | Correct scope; unshared categories denied; revocation is effective | Privacy/security owner |
| Files/governance | Authorized protected retrieval works; anonymous access fails; quarantine and retained history are understood | Technical operator |
| Worker/recovery | Scheduled job completes; failure is visible; controlled retry and restoration evidence exist | Technical operator |
| Intended external service | Real callback/failure/delivery evidence, or explicit exclusion with approved alternative | Service owner |

### Record defects rather than hiding them

Use **Not started**, **In progress**, **Blocked** or **Accepted** in the readiness register. Attach evidence before marking Accepted.

An unresolved incorrect-patient access, lost clinical data, failed consent boundary, missing critical clinical evidence or unsafe response path blocks the affected launch. A cosmetic issue may be deferred only with an owner, impact assessment and agreed correction date.

Do not rerun broad suites for a document edit. For application changes, choose verification proportionate to the changed behavior and retain its actual outcomes. Consult `docs/LOCAL-ACCEPTANCE.md` for historical local results and their limitations.

**Exit criterion:** all in-scope checks are accepted or have an explicitly approved, safe exclusion; no unresolved blocker affects the chosen launch track.

## 13. Train staff and prepare the first cohort

**Owners: care-team lead and administrator.**

Train by role using the companion user guide rather than asking everyone to read every administration chapter.

| Audience | Rehearsal they must complete |
| --- | --- |
| Administrator | Configure a site/account, import a fictional roster, investigate an access issue and route an operational failure |
| Care manager | Find due work, review evidence, contact/document, record time and hand off an unresolved concern |
| Provider/therapist | Review and sign appropriate content, correct through revision/addendum and respond to escalation |
| Behavioral manager/consultant | Complete the intended registry and qualified consultant review workflow |
| Billing | Explain blockers, reconcile sample evidence, export and close/reopen appropriately |
| Patient/caregiver | Set up access, find permitted content, complete a task/message and understand urgent-help limitations |
| Technical support | Recognize an outage, inspect worker/file health and use the approved incident/recovery procedure |

Record participant, role, training date, observed task and follow-up. Reading a document or watching a presentation alone is not an observed workflow rehearsal.

Prepare a first-cohort list with accountable care owner, program, eligibility review, consent status, signed plan, patient access status and next contact. Keep sensitive roster details only in an approved location; the generic implementation checklist should not contain patient information.

**Exit criterion:** first-cohort coverage is staffed, people can perform their own tasks and the support path is known.

## 14. Apply the launch gates

**Owner: practice sponsor makes the decision with accountable leads.**

### Gate A — synthetic evaluation

- Environment identified and approved for fictional data.
- Named evaluation participants and permitted sample accounts agreed.
- Practice, locations and representative roles configured.
- Intended fictional journeys accepted with saved database evidence.
- Simulated integrations, provisional billing and AI review boundaries explained.
- Technical and clinical support owners available for the session.
- No real patient information introduced and no claim that evaluation constitutes clinical approval.

### Gate B — real-patient operation

Do not treat Gate A as Gate B. Before any real patient information enters the target environment, obtain the applicable privacy/security and data-hosting authorization.

- Legal/privacy/security owners approve the intended data handling, access, hosting and applicable vendor agreements.
- Named staff, credentials, least-privilege access and secure setup/recovery delivery are verified.
- Clinical lead approves intended policies, thresholds, content, consent, escalation and coverage.
- Billing lead approves applicable payer interpretation, sample reconciliation and downstream claims process.
- Target schema/guards, private files, worker and monitoring pass target-specific acceptance.
- Database and document restoration is demonstrated; incident, outage and reconciliation procedures are agreed.
- Upload malware handling, retention and lifecycle controls are approved for actual data. The synthetic unscanned-release mechanism is not accepted as production screening.
- Intended external services pass live acceptance, or are explicitly excluded with a safe approved workflow. No simulated service is described as active care delivery.
- Any data migration has an approved source, destination, mapping, reconciliation, backup and cutover/reversal plan.
- In-scope defects are resolved or safely excluded; staff training and first-cohort coverage are complete.

This is an implementation checklist, not legal advice, clinical certification or a substitute for an independent security assessment. Add any obligations identified by the practice and its advisers.

### Record the launch decision

Capture launch track, environment, source revision, approved cohort/programs, evidence references, open exclusions, approving owners, decision date and conditions for stopping. Use the practice's approved attestation/sign-off process; this document does not create a new in-app approval workflow.

**Exit criterion:** an explicit, attributable decision authorizes only the recorded scope and data class.

## 15. Launch, monitor and hand over

**Owners: implementation lead coordinates the initial period; operational owners take over.**

Start with the approved bounded cohort. Do not import the entire practice simply because a small rehearsal passed.

### First operating day

1. Confirm the intended environment, source revision, care-team coverage and technical support availability.
2. Confirm worker heartbeat, private-file retrieval and priority exception visibility.
3. Onboard only the approved patients using the rehearsed sequence.
4. Check that saved enrollment, consent, plans and assignments match the cohort list.
5. Review urgent work and unresolved failures during the agreed support windows.
6. Record issues with clinical impact and an accountable owner.

### First week and expansion

Review incomplete enrollment, missing readings, unanswered outreach, task ownership, delivery failures, billing blockers, access problems and support burden. Use these findings to correct process or configuration before expanding.

Compare the team's actual effort with the intended model: clinicians should work on patient care, while administrators/operators own setup and technical failures. Repeated manual maintenance or duplicate entry is an implementation issue to investigate, not a permanent clinical duty.

### Stop and recover safely

Stop expansion and escalate immediately when wrong-patient access, corrupted/missing clinical evidence, ineffective consent boundaries or an unsafe clinical response path is suspected.

The operator may pause affected processing under the incident procedure. Preserve logs, source records, signed evidence and audit history. Assess clinical impact and use the approved care fallback.

A software rollback is not automatically a safe database reversal. Do not clear a database, overwrite a newer record set, delete private objects or erase signed history to return to an earlier-looking screen. Use reviewed recovery/migration procedures and reconcile records created since the change.

### Handover pack

Provide the approved implementation brief, configuration/access roster, clinical/content approvals, roster reconciliation, acceptance evidence, training record, launch decision, support/escalation contacts, operational runbooks and unresolved issue register.

Agree when implementation support ends, who owns each remaining issue and what evidence is needed before cohort expansion.

**Exit criterion:** the practice has accepted operational ownership, support is assigned and expansion depends on reviewed outcomes rather than an assumed completion date.

## 16. Readiness register and owner inputs

The companion CSV checklist is a blank working register. Assign a person and target date to each row, record evidence and use the status labels from chapter 12. It contains no patient details or credentials.

### Information needed from the practice

| Input | Supplied by | Used for |
| --- | --- | --- |
| Legal/display identity, locations and timezones | Practice sponsor/administrator | Environment scope and practice setup |
| Intended programs, cohort and launch track | Sponsor and clinical lead | Bounded acceptance and launch decision |
| Named staff, site roles and verified professional details | Administrator and clinical lead | Account access, assignments and signatures |
| Coverage, escalation, urgent-help and outage procedures | Care-team/clinical leads | Safe daily operations |
| Policy, consent, template and questionnaire approvals | Clinical/content owners | Governed configuration and patient enrollment |
| Payer requirements, fee assumptions and billing process | Billing lead | Evidence reconciliation and downstream claims handling |
| Approved roster format and source ownership | Data owner/administrator | Import and identity reconciliation |
| Hosting/data authorization, retention and vendor decisions | Privacy/security owner and operator | Real-data gates and operational safeguards |
| Monitoring, recovery, support and change ownership | Technical operator | Technical handoff and incident response |
| Live service choices, contracts and acceptance owners | Sponsor/service owners | Separately scoped integration work |

Do not send secrets with these answers. Identify the credential custodian and use the approved secrets configuration process when integration or deployment work is authorized.

### Companion references

- **Practice and care-team user guide:** `docs/USER-GUIDE.md` and its PDF/HTML editions; detailed screen-level instructions.
- **Patient import template:** the blank Excel workbook and in-app CSV download.
- **Implementation coverage:** `docs/IMPLEMENTATION-COVERAGE.md`; implemented scope and remaining qualification work.
- **Local acceptance:** `docs/LOCAL-ACCEPTANCE.md`; recorded local checks, not target-environment certification.
- **Owner handover:** `docs/OWNER-HANDOVER.md`; source, current scope and operator context.
- **Technical operations:** `docs/WORKER-OPERATIONS.md` and `docs/GCP-DEPLOYMENT.md`; engineering references, not permission to provision or migrate.

**The completion standard:** the right people can use the agreed workflows, the target environment has the required evidence, and every remaining dependency has an owner. A populated dashboard or an installed application alone is not implementation acceptance.
