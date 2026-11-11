---
name: OpenAPI request-body naming
description: Avoiding generated request-body export collisions in this workspace.
---
Reference a named component schema for new JSON request bodies instead of defining an anonymous inline object.

**Why:** The current generator and barrel exports can emit the same operation-body name from both validators and generated types, causing a duplicate-export error after otherwise successful generation.

**How to apply:** Give the input a meaningful name distinct from the operation's generated body name, reference it from the request body, then regenerate. Do not patch generated output to hide the conflict.
