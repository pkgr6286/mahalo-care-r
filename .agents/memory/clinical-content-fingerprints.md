---
name: Clinical review fingerprints
description: Preserving clinical-content review across PostgreSQL JSONB serialization without bypassing review.
---

Canonicalize nested JSON object keys before hashing reviewed questionnaire content. Preserve array/question order and bind wording, recall period, anchors, language, version, answer range and scoring.

**Why:** PostgreSQL JSONB changes object-key ordering. A fingerprint computed from input-order `JSON.stringify` can fail after storage even though the reviewed content is unchanged; source-based PHQ/GAD submissions were blocked this way.

**How to apply:** Include nested scoring bands and conversion tables in canonicalization. Accept older proofs only when they still match the exact current content. An owned synthetic definition may have its fingerprint format upgraded only after comparing the entire content against its known source; never automatically reapprove user changes. Preserve historical response snapshots. Identical complete clinical snapshots can remain comparable across a fingerprint-algorithm change, while different wording/scoring/versions must remain separate.
