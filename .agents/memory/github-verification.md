---
name: GitHub push verification
description: Verify a successful push through the authenticated API when Git read transport disagrees.
---

If a Git push is acknowledged but `ls-remote` returns no refs or fetch reports a missing branch, verify the destination branch through the authenticated GitHub integration before declaring failure or retrying the write.

**Why:** In this workspace, a proxy-backed push succeeded while Git read commands returned empty/missing refs. The authenticated GitHub branches API independently confirmed the exact local commit on the destination branch.

**How to apply:** Compare local HEAD with the branch's commit SHA through the existing GitHub connection. Do not force-push, rewrite history or request credentials merely because the Git read transport disagrees.

Recheck `origin` immediately after attaching a GitHub connection and before any push. Attaching the connection in this workspace restored an existing, different repository as `origin`; use the user's explicitly approved URL until the remote has been corrected. Never assume that connecting an account preserves the chosen repository.
