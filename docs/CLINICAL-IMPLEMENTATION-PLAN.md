# Doctor-ready single-practice implementation

## Scope agreed with the owner

Build the complete single-practice experience on the existing React / Node / PostgreSQL / Drizzle stack. All displayed clinical facts, histories, metrics and actions must be grounded in the database and working APIs. Keep the official Mahalo identity. External service credentials/connections, multi-tenancy, native mobile and formal WCAG qualification are deferred. Do not use GitHub Actions. Do not publish automatically.

## Data strategy

- A coherent, explicitly synthetic practice, not unrelated rows generated to fill screens.
- Thirty longitudinal patient stories spanning hypertension, cardiometabolic disease, musculoskeletal rehabilitation, complex chronic care and behavioral care.
- Conditions, medications, coverage, identifiers and contacts use structured relational models.
- Monitoring trends, symptoms, plans, conversations, follow-up tasks, clinical notes and time evidence agree with each patient's story.
- Calendar and rolling-period metrics come from the same rules used for billing evidence.
- Test fixtures and historical validation records remain retained, but are classified separately from clinical presentation data. Never delete signed history or audit records to clean the UI.
- No fabricated frontend metrics, hidden network failures, pretend external deliveries or claims of clinical certification.

## Execution milestones

1. Inspect supplied screens and classify current data; establish non-destructive fixture isolation.
2. Create structured clinical models and profile APIs; prepare coherent patient histories and governed reference content.
3. Improve all doctor-facing screens and forms; integrate the structured chart and consistent program progress.
4. Complete remaining local workflows and exports, including reporting and access/relationship controls.
5. Correct runtime/session/readiness problems and make background-job behavior explicit.
6. Verify locally with unit tests, real HTTP/database checks and a focused browser pass over the complete clinical journey.
7. Prepare a final handover: verified features, actual checks, remaining limits, deployment instructions and precisely what the owner must provide.

## Release boundary

This is a synthetic demonstration until clinical, coding, legal, vendor and infrastructure qualification is complete. External service integration must remain honestly identified as not connected. A successful local demonstration is not a claim of PHI readiness or reimbursement eligibility.
