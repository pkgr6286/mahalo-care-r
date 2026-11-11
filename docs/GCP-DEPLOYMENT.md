# Mahalo Care — GCP handoff for the synthetic single-practice demo

No GCP project, paid instance, public service, domain or production database has been provisioned. Private **development** file storage was separately approved and enabled on Replit. This guide is not evidence of a successful GCP deployment.

## Decisions and prerequisites before creating resources

- Choose the GCP project, billing account, permitted region, cost ceiling and people allowed to see the demo. Cloud SQL and an always-running worker incur charges even without visitors.
- Keep `DATA_CLASS=synthetic`. Real patient data requires independent clinical, licensing, CMS/payer, security and privacy review, relevant agreements/BAAs, verified vendors and a production retention policy.
- Use Cloud Run, Cloud SQL for PostgreSQL and a private Cloud Storage bucket in the approved geography. Choose a Node.js 24 runtime. Native mobile and multitenancy remain separate.
- Use a dedicated runtime service account. Grant Cloud SQL Client, access only to the required Secret Manager secrets, and access only to the private application bucket. Do not grant project Owner or publish bucket objects.
- Application startup performs no schema installation or demonstration seeding. Apply the reviewed Drizzle schema with a migration identity, then explicitly install integrity guards with the command below. Use a separate least-privilege runtime identity; readiness rejects missing tables, guards or required indexes.
- Review public demo accounts before internet access. Prefer an IAM-restricted/internal staging service initially. Email/password remains the application's authentication; do not silently replace it with an external identity system.

## Build and runtime

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build:portable
# After configuring the database, private storage and session secret:
PORT=8080 pnpm start
```

The single Node service serves the built React app and `/api` on `PORT`. Hashed web assets are cached; HTML is not. Unknown API routes must not turn into HTML. Official PDF brand fonts/logos remain in `artifacts/mahalo-care/public/brand`; do not omit them from the release. Python is optional font-regeneration tooling, not a runtime dependency.

Google's Node buildpack recognizes `pnpm-lock.yaml`, the `engines.pnpm` version, `gcp-build`, and the root `start` script. `.gcloudignore` excludes local dependencies, generated output, uploaded source specifications, agent context and environment files. Do not put secret values into source, build arguments, command history or committed YAML.

## Database and private files

1. Create the approved Cloud SQL instance/database and a migration/bootstrap user, with backups and point-in-time recovery configured for the intended environment.
2. Apply the reviewed Drizzle schema to the **confirmed target** using the migration/bootstrap identity. Never point the local development push command at an unidentified database. A clean GCP database needs schema installation before the server starts. Then run `node artifacts/api-server/dist/install-integrity.mjs --approve-integrity-install` with that migration identity. This explicit command installs guards, not synthetic accounts or data; do not put it in the web startup command.
3. For a demo-data transfer, stop writes, take a consistent PostgreSQL dump with the appropriate PostgreSQL client, restore into staging and verify row counts, constraints, immutable history, billing source hashes and account states. Treat dumps as private data; never commit them.
4. Copy retained objects to the target private bucket while preserving their relative `clinical-documents/<document-id>.pdf` names. **GCS object generations change when copied between buckets.** Verify exact SHA-256 and size, then use a separately reviewed metadata migration to pin each new generation. The development one-way PostgreSQL migration is **not** a cross-bucket production migration.
5. The server supports `STORAGE_DRIVER=gcp` using Cloud Run's application-default service account. Set `PRIVATE_OBJECT_DIR=/YOUR_PRIVATE_BUCKET/private`; stored logical paths remain `/objects/clinical-documents/...`. No Replit sidecar is used for this driver.
6. Keep buckets private, use uniform bucket-level access and public-access prevention, and configure the approved retention/versioning policy. Current application immutability guards and byte hashes are not legal WORM storage, qualified electronic signatures, malware scanning or a guarantee against a privileged operator.
7. The database contains document metadata and frozen structured source snapshots, **not file bytes** after the approved development transfer. The nullable legacy byte column is compatibility-only; all current documents must have null bytes.

Cloud uploads happen before the clinical database transaction commits. If upload fails, the signature/period close does not commit. A process failure between object creation and database commit can leave an unreferenced private object. Reconcile old objects against document rows before any cleanup; do not blindly delete objects or regenerate signed PDFs.

## Runtime settings

Store `DATABASE_URL` and a new, sufficiently random `SESSION_SECRET` in Secret Manager, not the deployment source. Do not reuse development sessions in staging. Cloud Run must receive:

| Setting | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATA_CLASS` | `synthetic` |
| `SERVE_WEB` | `true` |
| `STORAGE_DRIVER` | `gcp` |
| `PRIVATE_OBJECT_DIR` | approved private bucket/prefix |
| `PORT` | supplied by Cloud Run |
| `DATABASE_URL` | private secret using the approved Cloud SQL connectivity |
| `SESSION_SECRET` | private secret |

The managed Replit AI proxy must not be assumed to work outside Replit. Deterministic drafting starts without AI keys. Configure and qualify an approved external AI adapter separately before enabling live drafting on GCP; do not copy a Replit proxy credential into a different hosting environment.

For Cloud SQL Unix sockets, attach the Cloud SQL instance to the service and use the documented `/cloudsql/PROJECT:REGION:INSTANCE` socket host. Use the supported Cloud SQL connector/private connectivity approach if choosing a different topology. Never place a database password directly in a command example or a public URL.

## Worker and deployment topology

The PostgreSQL queue uses transactional claims and `SKIP LOCKED`; it is not Redis/BullMQ. The current process runs both HTTP and the durable worker. For this demo use one maximum instance initially, a minimum of one instance and **instance-based CPU allocation**. Request-only CPU or scale-to-zero can delay monitoring, tasks and notifications. For larger deployments, separate/qualify workers and distributed AI quotas first.

After approving resources and creating their identities, a deployment operator can adapt:

```sh
gcloud run deploy mahalo-care \
  --source . \
  --region APPROVED_REGION \
  --service-account APPROVED_RUNTIME_ACCOUNT \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-env-vars NODE_ENV=production,DATA_CLASS=synthetic,SERVE_WEB=true,STORAGE_DRIVER=gcp,PRIVATE_OBJECT_DIR=/PRIVATE_BUCKET/private \
  --set-secrets DATABASE_URL=DATABASE_SECRET:VERSION,SESSION_SECRET=SESSION_SECRET_NAME:VERSION \
  --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --no-allow-unauthenticated
```

These are **instructions for a future approved operation**, not commands run by the agent. Resource names are placeholders, not guessed project identifiers. Budget the build, registry, storage, database, backups and always-allocated CPU. Confirm the current gcloud flags and organization policies before execution.

## Staging acceptance before sharing a demo URL

- Root login and deep React routes load; `/api/healthz` and authenticated `/api/auth/me` work; unknown `/api` paths return JSON authorization/not-found errors, not the React shell.
- Sign in using email/password; validate session revocation and browser CSRF through the real HTTPS hostname.
- Exercise one whole program journey: enrollment/consent → plan → reading/check-in → rule → reviewed note → exact time → provisional billing close/review/export.
- Confirm all eight scoped worklists and correct clinician/consultant credential checks.
- Download a retained PDF and its source manifest; independently verify hashes and old clinical revisions. Anonymous direct bucket access must fail.
- Review/edit an AI draft; prove acceptance does not sign a note or commit time. Secure-message acceptance is a real in-app send.
- Restart/redeploy while work is queued; prove records, retained versions, preferences and queued jobs survive. Verify no duplicate effects.
- Outbound SMS/email/video and EHR/device fixtures must still be labelled console/simulated/read-only unless a separately qualified real vendor is connected.
- Run the local acceptance commands against isolated staging fixtures; review logs without recording chart text, credentials or cookies.
- Keep the previous revision and database/object recovery procedure available; a code rollback does not automatically undo schema or clinical data changes.

## Supporting-upload staging gate

Supporting PDFs use short-lived private **PUT** URLs, then server validation and a separate sealed object. Cloud Run's Google-ADC driver signs these URLs with the Storage SDK. Review and grant the runtime identity narrowly scoped `iam.serviceAccounts.signBlob` permission for the upload-signing service account; do not download service-account private keys. Configure the private bucket's CORS policy for the approved application origin, PUT and Content-Type, without granting public object reads.

Include `care_attachments` and its immutable provenance/state guards in the reviewed schema migration and generation-pinning object migration. The web workflow is PDF-only, 1 MiB, twenty new tickets per account per hour, and explicit **unscanned synthetic-demo release**, not malware clearance. Actual cloud size/content encoding is checked before download/decoding; the PUT URL itself is not a production content-length policy. Before public/clinical use, qualify cloud-side upload limits, sandboxed malware scanning, quarantine release policy and private incoming/orphan lifecycle cleanup. Preserve sealed file versions and their hashes; never delete objects merely because their temporary upload URL expired.

Staging must prove browser CORS, patient/role/location isolation, quarantine download denial, exact-byte sealed downloads despite later incoming overwrites, stale review rejection and revocation. Supporting files do not automatically enter signed clinical documents, AI context or billing evidence.

## Official references consulted

- [Node.js buildpacks, pnpm and build/start scripts](https://docs.cloud.google.com/docs/buildpacks/nodejs)
- [Deploy Cloud Run services from source](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Connect Cloud Run to Cloud SQL for PostgreSQL](https://docs.cloud.google.com/sql/docs/postgres/connect-instance-cloud-run)
- [Cloud Run autoscaling and minimum instances](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
