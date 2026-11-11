# Mahalo Care — Practice and care-team user guide

Single-practice edition · 11 November 2026

## 1. Start here

This guide takes a practice from **no patient records** to a working care-management routine. It is written for the people operating the practice, not software engineers.

**The operating principle:** an administrator sets up the workspace once; clinicians spend their day reviewing patients, handling exceptions and documenting care. Routine rule checks, scheduled task creation and notification processing belong to the background worker—not a clinician's daily checklist.

**Current environment:** fictional patients only. Do not enter real patient information. The included clinical and billing baselines require practice review; EHR, video and outbound delivery are simulated. Optional live AI is available only as a reviewed drafting aid. This guide explains the working product without treating those qualifications as completed production approvals.

### Choose your route

| Your role | Read first | Your main responsibility |
| --- | --- | --- |
| Practice administrator | Chapters 3–8, 13 and 22 | Configure the practice, manage access and import the roster |
| Care manager or nurse | Chapters 9–12 and 14–18 | Enroll, review exceptions, contact patients and document care |
| Provider or therapist | Chapters 10–12, 16 and 19 | Review clinical plans, sign where qualified and resolve escalations |
| Billing team | Chapters 19–20 | Review actual evidence and period decisions |
| Patient | Chapter 13 | Use the patient web workspace |
| Family caregiver | Chapter 13 | Use only the information the patient has authorized |
| Deployment operator | Chapters 3 and 24; separate deployment handover | Provide the running environment and its operational safeguards |

### The complete first-patient sequence

1. Sign in with the administrator account supplied by your deployment operator.
2. Set practice details and timezone.
3. Create locations, staff accounts and appropriate site permissions.
4. Review care policies and the content your practice intends to use.
5. Import a roster or add a patient manually.
6. Verify the patient's clinical profile and assign the care team.
7. Open **Enrollment & consent**, choose the program and record informed consent.
8. Create and sign a patient-specific care plan with a qualified signatory.
9. Link the appropriate device or patient tasks and invite the patient to the web workspace.
10. Start using **Today** and **Worklists**. Review billing evidence at the appropriate interval.

**Registration is not enrollment.** Creating a patient record does not create consent, an active program, a signed care plan, a portal account or billable time. Those are separate, deliberate steps.

## 2. What comes with the workspace

The following capabilities are included. They use saved database records, rather than presentation-only examples.

| Area | Included capability | What a person still decides |
| --- | --- | --- |
| Practice and access | One practice, multiple locations, email/password accounts, site-aware roles, invitations and staff idle locking | Who may access which location and which role they need |
| Patient panel | Search, filters, sortable columns, manual registration, Excel/CSV roster import | Patient identity, assignment and the accuracy of imported information |
| Shared chart | Demographics, structured clinical profile, timeline, readings, programs, plans, notes, time, messages and private files | Clinical reconciliation and interpretation |
| Care programs | RPM, RTM, CCM, PCM and BHI workflows; CoCM registry and qualified consultant review workflow | Clinical eligibility, payer applicability and the correct care pathway |
| Policies | Five bundled program rulepacks; versioned policy drafts, validation, review, publication, retirement and payer overrides | Practice approval and current authoritative requirements |
| Plans and notes | Structured program-specific plans, versioned notes, signature workflows, revisions and private document copies | Patient-specific content and professional attestation |
| Worklists and rules | Eight saved worklists, configurable rules, exception assignment, acknowledgments and resolutions | Appropriate response, urgency and follow-up |
| Daily tasks | Tasks generated from signed schedules and evidence gaps; patient completion and education acknowledgments | The patient's actual care schedule and whether work is complete |
| Monitoring | Device inventory, assignment, readings, validation, trends and missing-data/threshold exceptions | Correct equipment, measurements and clinical response |
| Questionnaires | Source-backed English PHQ-9/GAD-7 definitions and scoring; custom questionnaire builder and content review | Appropriate use, licensing, interpretation and follow-up |
| Communications | Secure in-app messaging, outreach/interaction history and contact preferences | Actual contact, patient communication and any emergency response |
| Patient and caregiver access | Responsive patient web workspace; consent-bound, category-limited caregiver access | Who is invited and what the patient permits sharing |
| Time and billing | Timers, manual time evidence, overlap prevention, provisional calculation, blockers, close/reopen and review decisions | Whether care occurred, qualifying evidence and billing approval |
| Reports and exports | Practice reports, CSV/XLSX data exports, governance reports and audit checkpoints | Review, distribution and retention of sensitive exports |
| Operations | Durable background jobs, reading inbox, retries, captured notification outbox and configuration transfer | Operator response to actual failures and production safeguards |
| Optional AI | Source-linked draft creation, accept/reject review and usage records | Every clinical decision, factual correction and final signature |

**Not supplied as a live service:** connected EHR access, physical device-vendor feeds, real video visits, email/SMS/push delivery, payer claim submission, licensed ODI/PROMIS content or a native mobile app. The patient web workspace works now; the native app and additional identity providers are later work. Multiple independent practices/tenants are also deferred.

## 3. Before the first administrator signs in

**Responsible person: deployment operator and practice owner.** This is a handoff, not work for every clinician.

Ask for the following:

1. A working application address and a named administrator account—not a shared sample account.
2. Confirmation of which environment you are using and what data it is approved to hold.
3. A running database, private document storage and background worker.
4. An agreed support contact, backup/recovery owner and escalation route for outages.
5. Confirmation that database integrity protections and the required schema have been installed.

An empty practice means **zero patient records in a provisioned environment**. It does not mean the software can provision its own cloud infrastructure from the sign-in screen. The first administrator is provided by the deployment operator; there is no public self-registration that grants administrator access.

The existing evaluation workspace contains fictional cases. This guide does not ask you to delete them. If you want a genuinely empty environment, have the operator provision a separate approved database/environment; do not reset or overwrite a populated database.

### Sign in and secure your account

1. Enter your email and password on **Sign in**.
2. Use **Forgot password?** if needed. In the current local-delivery configuration, an administrator supplies a new setup/reset link; do not assume an email was sent.
3. Use your account controls to change your initial password.
4. For a supervised walkthrough only, **Sample accounts** expands the available fictional personas. **Fill** fills the form; you still press **Sign in**. These are not production staff accounts.
5. Sign out when handing a device to another person. Staff sessions lock after inactivity; entering your password unlocks your session. Patient and caregiver accounts have a separate access model.

## 4. Set the practice details once

**Responsible person: practice administrator.**

1. Open **Admin → Settings**.
2. Set the practice name, support email and support phone.
3. Set the practice **Timezone**, using an IANA name such as `America/New_York`.
4. Review the patient app name, accent color, notifications and quiet hours.
5. Save. Reload the page to confirm the saved values.

The practice timezone is a default, not a substitute for each patient's timezone. A patient living elsewhere may need a different setting. Dates, quiet hours and calendar-day evidence depend on the correct timezone.

**What not to do every day:** re-enter these details, manually run maintenance jobs or reload sample data. Once configured, these settings remain saved.

## 5. Create locations and the care team

### Add practice locations

1. Open **Admin → Locations**.
2. Choose **Add** and enter the location name and relevant details.
3. Keep the location active while it is in use.
4. Create every location you will use before importing a roster.
5. Use consistent names. During import, a location must match an active practice location; matching is case-insensitive and the saved practice spelling is retained.

### Create accounts

1. Open **Admin → Accounts**.
2. Add a named account using the person's email and the least-privileged appropriate role.
3. Assign location access. If responsibilities differ by site, configure the person's role at each site rather than granting a broad role everywhere.
4. Record relevant professional credentials and provider identifiers where required by the role.
5. Create the invitation/setup link and give it to the intended person through an approved private channel.
6. The recipient opens the link, sets a password and signs in.
7. If the link has expired, issue a new one. Invitation/reset links expire after one hour and are not sent automatically by the current outbound adapter.

### Understand accounts versus the staff directory

An **account** controls sign-in, permissions and attribution. The **staff directory** supplies named care-team and provider references. Managed account information is synchronized into the directory; review the active directory after creating accounts instead of adding duplicate people. Directory-only entries do not, by themselves, grant sign-in access.

| Role | Typical use |
| --- | --- |
| Administrator | Practice setup, accounts, import, governance and broad operational control |
| Clinical administrator | Clinical oversight, clinical policy review and accessible-site supervision |
| Billing provider | Provider care, applicable signatures and billing work |
| Care manager / behavioral care manager | Assigned care, outreach, notes, time and follow-up |
| Psychiatric consultant | Qualified consultant assessment and review |
| Therapist | Therapy care and applicable clinical signatures |
| Front desk | Demographic registration and permitted coordination, not clinical attestation |
| Billing | Billing evidence and review without clinical writing authority |
| Read only | Review permitted records without changing them |
| Patient | One linked patient's permitted web workspace |
| Caregiver | Only explicitly granted patient categories |

A person does not receive the union of all their site roles. The selected site determines the effective role for that session. If an expected control is missing, first check the site context and role instead of creating a second account.

## 6. Review care defaults before enrolling patients

**Responsible people: clinical lead and administrator.** Do this once for the programs and payers you intend to use, then review when requirements change.

1. Open **Programs** for program configuration and **Policies and templates** for governed versions. The latter is also available from **Admin**.
2. Choose the relevant program's **Included baseline**. Its detail opens automatically.
3. Read the structured summary. **Review and version details** contains the stored version, source, reviewer and fingerprint; these are retained for traceability without filling the main screen.
4. A bundled baseline is a starting point, not payer or clinical approval. Choose **Clone to draft** to adapt it; do not try to edit the bundled original.
5. Enter a meaningful new version and effective date. Review thresholds, evidence requirements, duration rules, time requirements and any payer-specific differences against current authoritative sources.
6. Save and validate the draft; use **Preview evidence** where available. Validation checks structure and example evidence, not clinical correctness.
7. An authorized reviewer chooses **Review**, records the source reference, a substantive review note and the attestation.
8. An administrator chooses **Publish**, records the reason and confirms.
9. Check that the correct version is offered for new enrollment. Existing enrollments keep the version they used; publishing does not silently migrate them.

### Templates, questionnaires and learning

You do not have to fill every configuration tab before caring for a fictional first patient. Configure what the intended workflow actually uses.

- **Admin → Templates** contains the reference template library. **Policies and templates** provides separately governed care-plan/note template versions; an empty template category means no version has been created there, not that its count is a patient count.
- The care-plan editor supplies structured fields and pre-fills problems/medications from the chart. It still requires a patient-specific plan; it does not turn a generic reference template into an approved care plan.
- To offer a reusable note form in **Notes**, create and publish a **Note template** for that program. Required sections must be completed before signing.
- **Admin → Instruments** is where authorized staff review questionnaire wording, source, scoring and permitted use. Do not activate licensed content you have not supplied or qualified.
- **Admin → Learning** is for patient education or original app guidance. Save drafts, review clinical wording and source/use permissions, then activate only appropriate content.
- **Admin → Rules** is for configuring clinical exception rules. Preview against suitable fictional cases before enabling a changed rule.

## 7. Import a patient roster from Excel or CSV

**Responsible person: administrator.** Care managers do not need to administer imports.

### Prepare the file

1. Use an Excel **.xlsx** workbook or a **.csv** file. Save older `.xls` files as `.xlsx` first.
2. Put column headers on the first non-empty row, followed by one patient per row. Keep each import to **500 patients**, with a source file under **1 MiB**. The final matched roster must also fit the **300 KB** submission limit.
3. Include first name, last name and birth date. Include a location column, or plan to select one default practice location for the import.
4. Use `YYYY-MM-DD` for text dates. Actual Excel date cells are converted to that form. Ambiguous text dates are not guessed.
5. Format MRNs and phone numbers as **Text** in Excel so leading zeros are preserved. Replace formulas with their values before importing.
6. Download **CSV template** in the import panel if you are starting from scratch. It has headers only; add your own fictional rows.

Save CSV as UTF-8 so names such as José or Zoë remain intact. Do not remove accents to work around a file-format problem.

| Field | Required? | How to prepare it |
| --- | --- | --- |
| First name | Yes | Separate from last name |
| Last name | Yes | Do not combine the full name in one column |
| Date of birth | Yes | Real calendar date, not in the future |
| Location | Yes, or default location | Active location already created in the practice |
| MRN | No | Existing source identifier; a new one is assigned when blank |
| Email / phone / sex | No | Accurate values or blank; email is checked if supplied |
| Condition / medication summary | No | Separate multiple entries with a vertical bar |
| Payer | No | Recorded summary, not verified coverage; blank remains unknown |
| Care manager | No | Active staff-directory name, or default assignment |
| Patient timezone | No | Valid IANA timezone; otherwise uses the displayed default |

**Fictional example only:**

```csv
firstName,lastName,dob,location
Alex,Example,1960-05-14,Garden City
Robin,Example,1954-09-23,Garden City
```

Replace the location with a location your practice actually created. These example names are training placeholders, not records to reuse in a real environment. The downloadable template also includes optional identifiers and clinical-summary columns.

### Upload, match, validate and import

1. Open **Patients → Import patients**. The same panel is available in **Admin → Settings**.
2. Choose the file. For a workbook with several sheets, check **Worksheet** and select the sheet containing patient rows. A likely roster sheet is selected initially; only the selected sheet is imported.
3. Review the four required field matches. Common headings such as “First Name,” “Date of Birth” and “Clinic” are recognized automatically.
4. If the file has different headings, choose the correct source column for each patient field. Each source column may map to only one patient field.
5. Choose a **Default location** and **Default care manager** if needed. A default fills blank or unmatched cells; it does not override a populated matched cell.
6. Expand **Optional fields** to review automatically matched contact details, identifiers, summaries and timezone. Read **Not imported** carefully: unmatched columns will not be submitted.
7. Check the preview—especially spelling, birth dates, location and leading-zero MRNs. It shows the first five patients, not the entire roster.
8. Confirm that the file contains only fictional patients in this environment.
9. Choose **Validate roster**. Review Rows, Valid, New and Duplicates, plus every row error.
10. Correct errors in the file or matching and validate again. Changes to the roster, mapping or defaults invalidate the previous validation.
11. When validation has no errors and there are new rows, choose **Import patients** and confirm the count.
12. Look for the saved **patients added** result. Choose **Done** or **Open patient panel** and verify the new records. Reloading the panel should retain them.

### What validation protects

- Missing or duplicate required headers, malformed CSV, invalid/future dates, invalid email/timezone and unknown active locations are rejected.
- Unknown care managers must be corrected or left unassigned.
- The same normalized name and birth date is treated as a duplicate; existing details are not overwritten. Expand **Review skipped duplicates** to see the reasons.
- A reused MRN attached to a different identity, or conflicting identifiers for the same identity, is an error—not an automatic merge.
- One invalid row blocks the entire import. Otherwise valid rows are not partially created.
- Import is safe to repeat for the same roster: existing patients are skipped, not recreated. If there are no new rows, import remains disabled.

The preview and validation refer to the matched roster rows. Blank spreadsheet rows are removed while preparing the roster, so reported row numbers may differ from physical Excel row numbers in a sheet with blank rows.

### What import deliberately does not do

Import creates the roster and summary information. It does **not** create verified coded diagnoses, reconciled prescriptions, verified coverage, portal accounts, consent, enrollment, signed plans or time evidence. Review the clinical profile next. This avoids turning an unverified spreadsheet into clinical or billing attestations.

The original workbook is read in the browser; it is not archived as a patient document. Validation/import sends the matched fields to the server and saves the result/audit evidence, not the original spreadsheet.

## 8. Add a single patient manually

**Responsible person: front desk or permitted clinical staff.**

1. Open **Patients → Add patient**.
2. Enter first name, last name and birth date.
3. Choose the active location. Set the patient's actual timezone; the initial form defaults to `America/New_York`.
4. Enter known contact details, payer summary and care-manager assignment. Leave unknown values blank rather than inventing them.
5. Enter condition/medication summaries if your role allows clinical writing.
6. Save. The workspace opens the new chart and assigns an MRN.
7. Verify identity and continue with the clinical review and enrollment below.

Manual registration is not an identity-matching/import tool. Search for the patient by name/MRN before creating another record.

### Use the panel efficiently

- Search by name, MRN or condition; filter by program and status.
- Click a column header to sort by Patient, Programs, Location, Risk, Minutes, Adherence or Last contact. Click again to reverse the direction.
- On a narrow screen, use the sort selector and direction control.
- Sorting applies to the full filtered panel before pagination, not only the currently visible page.
- A dash means no recorded value. Do not assume that a new patient's missing adherence/contact value means poor adherence or a completed interaction.

## 9. Verify the clinical profile and ownership

**Responsible person: clinician or care manager with clinical-writing permission.**

1. Open the patient's chart and verify name, MRN, birth date and location.
2. Open **Clinical profile**.
3. Review/add coded conditions and their status, source and onset details as known.
4. Review medications, dose, route, frequency and reconciliation information. A medication summary imported from a spreadsheet is not a reconciled prescription.
5. Review coverage, plan/member details, effective dates and verification status. A payer summary is not coverage verification.
6. Add relevant contacts and identifiers. Merely being an emergency contact does not grant health-information sharing or portal access.
7. Save, reload and check that the intended information persisted.
8. Confirm the care-manager assignment and appropriate billing/clinical provider. “Unassigned” is a work assignment still to make, not a clinician account.

Use the patient-specific record as the source for care. Do not copy another fictional patient's plan, dates, medication narrative or outcomes simply to make a chart look complete.

## 10. Enroll the patient and capture consent

**Responsible person: authorized clinician.**

1. Open **Enrollment & consent → Enroll**.
2. Choose the correct program.
3. Enter the qualifying condition.
4. If requested, enter the condition duration and initiating-visit date. The selected policy determines which evidence is required.
5. For RTM, select the appropriate musculoskeletal or respiratory stream.
6. Select the billing provider where applicable.
7. Review the selected policy/version summary.
8. Discuss the program, cost-sharing and the patient's right to stop. Check the informed-consent attestation only after the patient has actually consented.
9. Choose the consent method: verbal, written or electronic. If the policy requires separate device/app data sharing, record that consent too.
10. Choose **Enroll**. Confirm that an active program and its consent record appear.
11. Open the consent document if needed. The saved record is a staff attestation with a version/time trail, not a verified cryptographic patient e-signature.

| Program | Main workflow |
| --- | --- |
| RPM | Physiologic readings, device continuity, exceptions and management evidence |
| RTM | Therapy monitoring, exercises, pain/function or respiratory follow-up |
| CCM | Longitudinal management across chronic conditions |
| PCM | Focused management of a qualifying complex condition |
| BHI | Behavioral care, questionnaires, follow-up and relevant consultant workflow |

The server checks program conflicts and required evidence. If enrollment is rejected, read the specific reason and resolve the underlying issue; do not change patient facts to bypass it. Program descriptions here are not payer eligibility advice.

### Stopping or changing care

- **Pause** stops the active enrollment from accruing further qualifying activity.
- **Discharge** requires a reason and closes relevant open program work.
- **Revoke** consent records the reason and stops activity relying on that consent.
- The patient may withdraw consent in the patient workspace; the associated active program is paused.
- Starting again requires a valid enrollment/consent workflow. Do not assume a hidden “resume” toggle exists or that old consent is automatically renewed.
- Deactivating the patient record is different from discharging a program; review outstanding clinical work and device return separately.

## 11. Create, review and sign the care plan

**Responsible people: care team drafts; a role allowed to sign the plan reviews and signs.**

1. Open **Care plans** and create a new care plan.
2. Choose the enrolled program and enter a clear title and assessment/summary.
3. Review the prefilled problems and medications against the clinical profile.
4. Enter measurable goals, interventions, medication reconciliation date, expected outcome, named care team and review interval.
5. Complete the program-specific fields: monitored parameters/schedule/escalation for RPM; therapy details for RTM; qualifying-condition duration for PCM; assessment/scale/referral path for BHI.
6. Add the appropriate repeated patient/staff activities and schedules in the plan.
7. Save the draft. Resolve any missing-field messages. An expected outcome needs meaningful detail; the form requires at least 40 characters.
8. The qualified signatory reviews the complete draft and chooses **Sign**. Signing attests that the plan is comprehensive and was shared with the patient.
9. Open the document/PDF and verify its contents.
10. To change a signed plan, create a revision/new draft and sign that version. The original signed version remains preserved.

**What becomes automatic:** the system materializes scheduled tasks from signed plan items over its scheduling horizon and runs background checks. You do not need to retype the same daily task or press Generate tasks each morning.

**What remains clinical:** choosing appropriate goals, schedules and escalation instructions; reconciling medicines; discussing the plan; and signing the reviewed content.

## 12. Connect monitoring and the first follow-up

1. In **Devices**, find or add the relevant inventory item and assign it to the correct patient/program using the available assignment controls.
2. Confirm the device identity, status and monitoring stream.
3. Review the patient's **Readings** tab for measurements, validity, timing and trends.
4. Confirm the care plan's schedule and escalation contact are appropriate.
5. Check that expected patient tasks appear after the signed plan is processed.
6. Arrange the first follow-up and ensure a named staff member owns it.
7. For RTM or behavioral care, ensure the intended exercise/check-in/questionnaire content has been reviewed and is available.

The current environment can accept synthetic reading events and display their processing, but it is not connected to a live vendor. A simulated successful event does not prove a physical device is communicating.

## 13. Invite the patient and, if authorized, a caregiver

### Give a patient access

1. Verify that the patient record already exists and its email is correct.
2. In **Admin → Accounts**, create a **Patient** account and link the correct patient record.
3. Issue the setup link and hand it to that person privately. A roster email alone does not create the account or send an invitation.
4. The patient sets a password and signs in at the same application sign-in page.
5. Confirm they see only their own patient web workspace.

### Patient quick start

1. Open the patient workspace in a browser on a phone, tablet or computer.
2. Review the current plan and upcoming/assigned tasks.
3. Enter the permitted readings or check-ins and record actual medication/exercise task completion.
4. Complete assigned questionnaires and read/acknowledge learning material.
5. Send a secure message for non-emergency questions.
6. Review contact preferences and quiet hours; save changes.
7. Review plan documents and permitted supporting files.
8. Contact the care team to discuss stopping care, or use the available consent-withdrawal control.

The responsive web workspace is included. A native app-store mobile application is not part of this release. This is not an emergency messaging service.

### Give a caregiver limited access

1. In **Clinical profile → Contacts**, record the caregiver's actual contact details.
2. Record the patient's permission to share and select only the permitted categories. Save the contact.
3. An administrator creates a **Caregiver** account with the matching email and provides its setup link.
4. In the patient's **Clinical profile → Caregiver portal access**, choose **Grant access**.
5. Choose the eligible caregiver/contact, permitted scopes and required consent/attestation information; confirm.
6. Have the caregiver sign in and verify that only granted sections appear.
7. Revoke the grant when permission changes or access is no longer appropriate.

Caregiver access is not automatic from an emergency-contact entry. It does not grant billing, administrator, unrestricted clinical-profile or full-record export access. Messages sent by a caregiver remain attributed to the caregiver on the patient's behalf.

Changing/removing the contact's sharing, consent or email revokes existing caregiver access. Turning sharing back on does not restore the old grant; record a new grant when appropriate.

## 14. A clinician's daily routine

**Start in Today, not Admin.**

1. Confirm your active site/role.
2. Review **Today** for the patients and exceptions needing attention.
3. Open **Worklists → My exceptions** or **Team queue**. Review urgency, owner and new evidence.
4. Open the patient chart. Review recent readings, symptoms, messages, plan and outstanding tasks.
5. Carry out the indicated clinical/outreach work. Record the actual interaction and any escalation.
6. Record qualifying work time and a clinical note where appropriate.
7. Resolve or hand off the work item with a meaningful outcome. Set a follow-up if the issue is not complete.
8. Before finishing, review **Due today** and **Unsigned**. Stop/complete your timers and check for uncommitted time.

| The system handles | The clinician handles |
| --- | --- |
| Scheduled rule checks and missing-evidence checks | Determining what the evidence means |
| Repeated scheduled task creation | Choosing an appropriate plan and schedule |
| Updating saved readings and task completion | Confirming facts and assessing symptoms |
| Grouping repeated signals into active exceptions | Contact, escalation, outcome and handoff |
| Evidence calculations and visible blockers | Professional review and billing decisions |
| Saved history and document versions | Accurate notes and signatures |

An empty worklist may mean no item matches your current scope/filter—not that no patient needs care. Check site context, filters and patient status if the expected work is missing.

## 15. Worklists and exceptions

| Worklist | Use it for |
| --- | --- |
| My exceptions | Open exceptions assigned to you or your role |
| Team queue | Exception work across your accessible sites |
| Due today | Staff follow-ups due by end of the patient's local day |
| Tasks | Staff tasks within your scope |
| Billing at risk | Gaps found by the last provisional billing calculation; not a live forecast |
| Unsigned | Draft notes and plans awaiting signature |
| Device issues | Missing data, battery/connectivity gaps and equipment follow-up |
| CoCM registry | BHI enrollment, scores and qualified consultant-review cadence |

### Work an exception

1. Open the item and check the patient, program, severity, source and assignment.
2. Acknowledge when you are taking responsibility; acknowledgment is not resolution.
3. Review the actual reading/task/score behind the item.
4. Contact the patient or escalate according to the practice's clinical protocol.
5. Record the contact and outcome.
6. Resolve when the issue has been addressed, or dismiss only with an appropriate reason.
7. Reassign/handoff if another role must act. A duplicate signal may update an existing exception; it does not necessarily create a second item.

For immediate danger, use your practice's emergency process. Do not wait for an app message or a background rule.

In the CoCM registry, consultant reviews are professional assessments with credential/attestation requirements. A care-manager note or generic message is not a substitute for a qualified consultant review.

## 16. Document care, notes and time

### Notes

1. Open **Notes** in the patient's chart and create a clinical note.
2. Choose the program and, if available, a **Published note template**.
3. Complete the required template sections and patient-specific content.
4. Save the draft and review it.
5. A permitted signatory signs the note. Open its document to confirm the frozen content.
6. Add an addendum/revision rather than overwriting a signed note.

### Timed work

1. Open **Time** and select the correct patient, program and activity.
2. Start the timer when actual eligible work begins.
3. Stop it when the work ends; review and commit the resulting interval.
4. For eligible work completed without a timer, use manual entry with the real start/end values and supporting description.
5. Review any rejected overlap or period-lock message. Correct the facts; do not invent a different interval to pass validation.
6. If an entry is wrong, void/correct it through the permitted reasoned workflow. Retained evidence is not silently deleted.

The system prevents overlapping staff intervals and locks relevant evidence in closed periods. Merely opening a chart, sending a message, importing a roster or creating a simulated event does not prove billable care.

### Optional AI drafting

1. Choose the relevant assist/draft action and review its source context.
2. Deterministic mode does not call an external model. If explicitly using live AI, follow the synthetic-data confirmation and deployment restrictions.
3. Read every sentence, verify patient facts and correct errors.
4. Accept or reject the draft. Acceptance is not a clinical signature.
5. Sign a note only after normal professional review. Suggested time is not automatically committed as care time.

## 17. Messages, outreach, EHR context and appointments

### Secure messages and contact records

1. Open the patient's **Messages & EHR** tab.
2. Read the conversation and identify whether the sender is the patient, a caregiver or the care team.
3. Send a secure in-app message where appropriate.
4. Record actual outreach/contact in the interaction workflow with its channel, timing and outcome.
5. Distinguish an attempted call from a completed live interaction. A secure message does not automatically meet a live two-way-contact requirement.
6. Arrange and record the required follow-up.

Patient contact preferences and quiet hours affect captured outbound channels. In-app messages and staff alerts are separate from simulated email/SMS/push delivery. A captured outbox row is not proof of delivery.

### EHR context

The **EHR context** tab provides a read-only identity/resource-review workflow using synthetic fixtures in this environment. Refreshing that fixture is not a live EHR connection.

If identity review is requested, compare identifiers and demographic evidence before confirming the same person. Supply the required reason; unresolved identity conflicts must not be treated as linked clinical information. A DOB conflict cannot simply be overridden.

### Appointments and video

Appointment records and patient-facing schedule context are supported, but they are not a connected scheduling service. Video actions are simulated, not live consultations. Do not treat a created appointment or simulated session as evidence of attendance, completed clinical contact or billable time.

## 18. Questionnaires, learning and adherence

### Questionnaires

1. Confirm the intended instrument/content is active and reviewed for use.
2. Have the linked patient complete the available check-in/questionnaire in their web workspace.
3. Review the saved response, score and trend in the staff chart.
4. Act on concerning symptoms/scores according to the practice's protocol.
5. Document follow-up rather than relying on the score alone.

English PHQ-9 and GAD-7 definitions/scoring are included with source references. Custom questionnaires can be authored with sum, mean, percent or reviewed lookup scoring. A custom function check-in is not automatically a validated clinical scale. ODI/PROMIS or licensed translations must be supplied and qualified before use.

### Learning and task adherence

1. Use appropriate active learning material and signed care-plan schedules.
2. The patient reads the material and explicitly acknowledges the saved version.
3. The patient records actual task completion; staff review gaps and barriers.
4. Discuss the cause of missed tasks before changing the plan.

Acknowledgment proves that a user performed the acknowledgment action, not that they understood the material. A task checkmark is not a clinical outcome or automatic time claim.

## 19. Review billing evidence

**Responsible people: billing team and designated provider.**

1. Open **Billing** and choose the relevant period/scope.
2. Run the provisional calculation when evidence should be refreshed.
3. Review each candidate's status, source evidence and blockers: enrollment, consent, signed plan, time, interaction, device days and program-specific requirements.
4. Open the source record rather than relying only on a green status or a total.
5. Have the appropriate care team correct missing factual documentation through the normal workflow.
6. Recalculate when appropriate and check the updated evidence.
7. Close the period only after the authorized reviewer is satisfied. Closing freezes the relevant evidence/candidates.
8. Record the human approve/reject decisions and export the permitted review files.
9. If a closed period must change, use the permitted **Reopen** workflow with a reason; do not directly edit locked evidence.

Calendar-month care management evidence and rolling device-supply windows are not interchangeable. Partial minutes are not automatically rounded into a complete add-on block. Cross-program and repeat-billing protections may explain why a candidate is blocked.

Practice-wide closing/reopening requires the appropriate billing permission and all-location scope. A site-scoped reviewer should escalate to the authorized practice-wide owner rather than trying to bypass scope.

**This is evidence review, not payer submission.** Included thresholds/code families remain provisional until qualified for the actual practice, payer and service period. The workspace does not send claims or guarantee reimbursement.

## 20. Reports and exports

1. Open **Reports** for program enrollment/risk, trend, staff-time and site information.
2. Use **Exports** to preview and download the allowed patient, billing, audit or configuration data.
3. Choose CSV or XLSX where offered. A preview shows only the first rows; it is not the entire export.
4. Verify the selected scope before sharing a file.
5. Store downloaded files using the practice's approved secure process.

**Integration and AI diagnostics** is a collapsed specialist section; clinicians do not need to read driver diagnostics to manage patients. EHR/video/outbound adapters remain simulated, while any explicitly enabled live AI remains a separately reviewed drafting action.

Configuration transfer is different from patient import. Configuration exports exclude patient records and credentials; imports verify integrity and create drafts rather than silently overwriting/publishing the live configuration.

## 21. Documents, supporting files and governance

### Signed documents and supporting PDFs

- Signed plans, notes and consent records have private generated document copies with retained source/version evidence.
- Open a document using its document/PDF control. A later clinical revision does not rewrite the original signed document.
- The **Files** tab and patient-facing permitted file controls support private PDF attachments up to **1 MiB**.
- Supporting uploads first enter **quarantine** and are not downloadable there.
- An authorized administrator can reject/revoke a file or explicitly release a known fictional test file after acknowledging that it has not been malware-scanned. This is not a substitute for a production scanning service.
- A supporting file does not become a signed clinical note merely because it was uploaded or released.
- Full chart ZIP export is staff-scoped review/export functionality, not an automatically qualified patient-disclosure service.

### Access governance

1. Administrators review **Admin → Audit** for attributable activity.
2. Use **Access governance** for permitted access reviews and report archives.
3. Clinical administrators have their scoped governance view; practice-wide monthly access/audit reporting is restricted to the appropriate administrator role.
4. Generate/review the available weekly emergency-access, monthly access and monthly audit-checkpoint reports.
5. Download frozen PDF/JSON evidence where offered and use live verification to compare the saved checkpoint.

A verified checkpoint describes its captured snapshot. It is not proof of a continuous externally anchored or WORM audit ledger, and later events are outside an earlier snapshot.

### Emergency access

Emergency access is a justified, audited, **one-patient read-only** exception for eligible staff—not a way to switch into a more powerful general role.

1. Use the emergency-access control only when the legitimate clinical need cannot be met through normal scope.
2. Enter the exact MRN, meaningful reason and required attestation.
3. Review only that patient's permitted information.
4. End emergency access when the need ends; it also expires, with a maximum four-hour window.
5. Do not expect edit, billing, account-administration or whole-practice access. Site/emergency context applies across tabs and is reviewed in governance reports.

## 22. Operations without making clinicians operate the system

**Responsible person: administrator/operator.** Clinicians should not start their day here.

Open **Admin → Operations** when checking service health or investigating a failure.

### Device reading inbox

1. Review the summary and filters: **All**, **Needs attention**, **Waiting** and **Processed**.
2. Use **Needs attention** to find failed processing, invalid signatures and recorded errors.
3. Read the visible error. Expand a row's **Details** only when the operator needs identifiers or signature evidence.
4. Use the page controls to review the loaded recent history; records have not been deleted merely to shorten the screen.
5. Retry only an eligible failed item after addressing the cause.

“Received” means the event entered the inbox; “Processed” means normalization completed. A waiting or rejected event has not necessarily reached the patient's valid clinical readings.

### Background jobs

1. Review queued/running and failed counts.
2. Use **Failed only** to focus on errors.
3. Inspect the reason before choosing **Retry** on an eligible failed job.
4. Confirm the retried work actually completes; queued is not complete.

Completed job history is closed by default under **View recent job history**. Failure counts remain visible, and choosing **Failed only** opens the history. These counts describe the loaded recent window, not an all-time audit total.

The reading inbox and jobs endpoints each load the most recent 100 items. Their page controls navigate that window; the immutable audit review is a separate workflow.

**Run maintenance manually** is collapsed because scheduled rule sweeps, task materialization and notification processing are automatic when the worker is healthy. Manual runs are troubleshooting tools, not a routine care-team task.

**Simulator and demonstration tools** contains synthetic event simulation and loading a sample practice. Leave this closed during ordinary care and when setting up an empty practice. Do not load sample patients just to clear an empty screen.

### Operator responsibilities

The operator—not every clinician—monitors worker availability, recurring failures, storage access, backups/restores and vendor connections. Ask for confirmation of these responsibilities at the handoff. A healthy preview is not proof that a separate published environment has the same configuration or data.

## 23. Troubleshooting and first-week checklists

| What you see | What to do |
| --- | --- |
| Import patients is missing | It is administrator-only; ask the administrator to import the roster |
| Location rejected during import | Create/activate the location first, correct its spelling or choose a default |
| Required field is unmatched | Choose the correct column; split combined full names into first/last columns |
| Invalid DOB | Use a valid past date in YYYY-MM-DD or an actual Excel date cell |
| Duplicate patient or MRN conflict | Review identity; import will not merge or overwrite records |
| Import button disabled | Confirm fictional-only data, validate the current mapping, resolve all errors and ensure New is greater than zero |
| Newly registered patient has no program | Open Enrollment & consent; registration does not enroll |
| Patient cannot sign in | Verify a linked Patient account exists, then issue a current setup/reset link |
| Invitation email never arrived | Current delivery is local handoff; no email was sent automatically |
| Caregiver sees nothing | Check contact sharing, matching caregiver email/account, consent and an active category-specific grant |
| A field/action is missing | Check role, active site, patient scope and document/period state |
| New task or reading is waiting | Allow background processing; administrator checks Operations if it remains stuck |
| Signed record cannot be edited | Create a revision/addendum and obtain a new signature |
| Time rejected | Check actual overlap, program/activity eligibility and whether the period is closed |
| Billing candidate is blocked | Open its evidence and correct the underlying factual gap; do not invent time or consent |
| Patient is absent from the panel | Check name/MRN search, site context, program/status filters and access |
| Supporting PDF cannot download | It may still be quarantined, revoked or outside your access |
| Session locked | Unlock with your password; do not create another shared login |

### Administrator: before the first patient

- Named administrator secured; support/operator responsibilities agreed.
- Practice timezone and support details checked.
- Active locations created.
- Staff accounts, credentials, directory and site roles reviewed.
- Intended program policies/content reviewed; defaults clearly distinguished from approval.
- Roster validated and imported, or manual registration rehearsed.
- Patient/caregiver invitation handoff understood.
- Worker and private document access checked by the operator.

### Care team: each new patient

- Identity, location, timezone, contact details and ownership verified.
- Clinical conditions, medications and coverage reconciled as appropriate.
- Correct program and policy selected.
- Informed consent and any required monitoring-data sharing documented.
- Patient-specific care plan reviewed, shared and signed by a permitted signatory.
- Device/tasks/check-ins and follow-up checked.
- Patient portal invitation completed where appropriate.
- Caregiver access granted only when expressly authorized.

### End of the first week

- Check unassigned work, overdue tasks and unsigned records.
- Review enrollment/consent gaps and missing monitoring data.
- Confirm patients know how to reach the team and what to do in an emergency.
- Review captured notification failures separately from actual delivery.
- Check billing evidence blockers before period end.
- Administrator reviews access and unresolved operational errors.

## 24. What the owner must provide before real clinical rollout

This is a launch-input checklist, not work to delegate to every care manager. The current workspace remains fictional-data-only until the deployment is explicitly qualified.

| Owner/input | Required decision or material |
| --- | --- |
| Clinical lead | Approved program/payer policies, escalation thresholds, care pathways, consent wording, plan/note standards and clinical sign-off |
| Practice administrator | Real locations, staff roster, credentials, provider identifiers, site access and support ownership |
| Content owner | Licensed questionnaires/translations and education content, sources and permitted-use evidence |
| Privacy/security/legal owners | Approved hosting/data-use arrangements, required agreements, access/retention/disclosure policy and incident response |
| Deployment operator | Production environment, secure first administrator, database/schema safeguards, private storage, backup/restore, worker supervision and monitoring |
| EHR/device vendors | Authorized integration details, test environment, mappings and acceptance criteria |
| Communications owner | Email/SMS/push provider setup, sender identities, consent handling and real delivery testing |
| Billing owner | Applicable payer/service-period requirements, review responsibility and any later claim-submission integration |
| Product owner | Native mobile scope, later tenant isolation and additional authentication-provider decisions |

Use **OWNER-HANDOVER.md**, **GCP-DEPLOYMENT.md** and **WORKER-OPERATIONS.md** for the separate technical deployment details. No GitHub Actions or automatic PR workflow is required for the local build/test process.

### Final operating rule

Set up the system once, verify each patient's clinical facts and consent, then work from exceptions and scheduled care. Do not create fictitious evidence to make a dashboard green, and do not ask clinicians to perform infrastructure maintenance as a daily care task.
