---
name: Schema integrity ownership
description: Why integrity indexes belong in Drizzle rather than only bootstrap SQL.
---

Declare critical integrity indexes in the Drizzle schema and check their presence
in readiness; a bootstrap-created index alone is not durable.

**Why:** A development schema push removed the open-alert uniqueness index because
it was absent from the ORM schema. Application deduplication still appeared to
work, but the database backstop was gone until an explicit SQL assertion caught it.

**How to apply:** When adding integrity guards, keep ORM-owned indexes in the
schema, reserve bootstrap SQL for protections the ORM cannot express, and include
database-level negative checks after a schema push. Use the managed Publish
schema flow for production, not a custom startup migrator.
