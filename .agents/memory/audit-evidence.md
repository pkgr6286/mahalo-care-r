---
name: Audit checkpoint evidence
description: Snapshot-chain claims and PostgreSQL timestamp precision in retained audit evidence.
---

Retained monthly audit evidence is a checkpoint of an exact captured event set, not a continuously chained insert-time or externally anchored ledger. Later events outside that set must not be reported as tampering.

**Why:** The platform retains historical and verification activity, while each report intentionally freezes only its selected ordered set. Overstating a snapshot as WORM or compliance certification would misrepresent its guarantees.

**How to apply:** Preserve these distinctions in interfaces, verification and owner handoffs. Keep event ordering and hashes at PostgreSQL microsecond precision using stable UTC text; JavaScript Date loses sub-millisecond precision. Raw Drizzle SQL timestamps also need explicit date conversion where a Date is required, unlike mapped typed selects.
