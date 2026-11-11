---
name: Staff site access
description: Why different roles at different practice locations use explicit session contexts.
---

For staff with per-location role assignments, use one explicit active site and its role for each authenticated session. Do not combine privileges from different sites.

**Why:** A provider role at one site and a front-desk/read-only role at another must not become provider access at both. Keeping the effective actor scoped to one site also preserves the existing API permission and patient-scope checks.

**How to apply:** The stored base role is a fallback for accounts without a site map, not the authority for mapped clinical assignments. Resolve background alert ownership, worklist assignment and time reminders against the patient's actual site. Site switches must clear old client data and protect tracked time. Existing unmapped accounts retain their previous behavior until explicitly configured.
