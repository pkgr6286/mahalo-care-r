# Background processing

The API defaults to **embedded** processing for the local preview. Queue claims,
idempotency keys, retries and clinical writes remain in PostgreSQL.

For a separate worker deployment:

1. Set `WORKER_MODE=external` on the API through the hosting platform's environment configuration.
2. Build once using the normal workspace build.
3. Run `pnpm --filter @workspace/api-server start:worker` as a separate service,
   with the same database, private-file access and approved runtime configuration.
4. Give that service its own platform-provided `PORT`; it binds to all interfaces.
   Its only HTTP routes are `/healthz` and `/readyz`.
5. Keep processing continuously available. On Cloud Run, minimum instances alone
   does not guarantee background CPU: review always-allocated CPU, scaling and
   cost settings before provisioning. Do not rely on an idle scale-to-zero
   web instance for timely tasks, notification dispatch or device processing.

The worker records a database heartbeat every 15 seconds. Readiness reports a
missing/stale heartbeat after two minutes and overdue queued work after five.
This proves recent process/database activity, **not** successful vendor delivery
or complete processing of every job. Inspect retries and dead letters in
Operations. A readiness failure is not permission to drop or delete failed work.

Both entry points handle SIGTERM/SIGINT, stop accepting new connections and wait
for active work before closing the database pool. The application bounds draining
at 25 seconds; a hosting platform may impose a shorter termination deadline.
Exercise forced restarts and retry recovery in the approved staging environment.
No cloud worker or additional paid resource was provisioned.
