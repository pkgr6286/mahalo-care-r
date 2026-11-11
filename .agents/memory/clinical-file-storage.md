---
name: Private clinical file storage
description: User-approved development storage scope and its distinction from later GCP deployment.
---

Use private cloud storage for clinical document files in this project.

**Why:** The user selected “Use private cloud storage” and “Enable private development storage.” GCP deployment was explicitly a later step.

**How to apply:** Keep retained files private. This development-storage approval is not permission to provision or publish a GCP deployment; obtain separate approval for that operation.

Presentation-only cleanup must append a new retained artifact from the original frozen source, not overwrite original bytes, re-sign history or silently replace consent proof.

**Why:** Caregiver authorization is bound to particular consent evidence, and a nicer rendering is not a new clinical decision or a correction to historical patient facts.

**How to apply:** Preserve original source hashes/snapshots and earlier artifacts. Keep consent-proof objects unchanged when improving unrelated clinical-document presentation.
