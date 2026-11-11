---
name: Browser mutation proofs
description: Why passing native API authentication checks does not prove browser mutations send CSRF evidence.
---

Every browser mutation path, including small background activity, unlock and administration requests, must send the same current double-submit CSRF proof as the generated client.

**Why:** Native local HTTP clients can pass while browser-only Origin/fetch checks reject an unprotected raw request. A page can appear functional while staff activity is rejected and later password unlock also fails.

**How to apply:** Reuse the shared authenticated request path rather than adding raw mutation fetches. Keep server CSRF checks intact; verify a real browser request when changing staff-session behavior.
