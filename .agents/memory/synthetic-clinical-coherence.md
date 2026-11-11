---
name: Synthetic clinical coherence
description: Prevent inherited clinical contradictions and misleading chronology in fictional practice data.
---

Changing a fictional case's diagnosis or program requires reviewing the entire clinical narrative, not just its problem and medication lists.

**Why:** A heart-failure variant inherited inhaler-related barriers, a recent-contact narrative and a respiratory follow-up from its COPD base. The contradiction propagated into contacts, time descriptions and signed evidence.

**How to apply:** Check goals, barriers, assessment/recent contact, follow-up, tasks and patient conversations together. Refresh only explicitly owned synthetic records. Preserve existing signed sources; use the normal revision/signature workflow for corrected current evidence instead of editing originals.

Select current evidence through version lineage and dataset boundaries, not signed status alone: an original can legitimately remain signed after a newer signed revision exists.

Clinical chronology must use the event/message timestamp, with insertion time only as a fallback.

**Why:** Bulk preparation gave many messages the same insertion timestamp, so an outgoing reply could appear before the patient report and all conversations looked newly received.

**How to apply:** Separate reported/sent-at time from database-created-at time in ordering and labels. Keep actual new messages and human edits intact when improving fictional boilerplate.
