# Illustrated customer guide: maintenance and regeneration

## Deliverables and sources

- Customer instructions: `docs/USER-GUIDE.md`.
- HTML/Excel generator: `scripts/create-user-guide.mjs`.
- Screenshot renderer and offline image viewer: `scripts/lib/guide-illustrations.mjs`.
- Actual-screen capture: `scripts/capture-user-guide.mjs`.
- Output checks: `scripts/check-user-guide.mjs`.
- Separate rollout manual: `docs/IMPLEMENTATION-GUIDE.md`; do not replace it with the customer manual.

The illustrated edition contains 24 chapters and 26 actual application screenshots, captured on 17 November 2026. The screenshot manifest records the application source revision and capture time. These are navigation illustrations from the fictional development practice, not a new full workflow acceptance report. No clinical records, invitations, settings, messages, billing decisions or questionnaire responses were submitted for these images.

## 1. Capture current screens

Start the existing managed web and API workflows. The development practice must be synthetic, with its standard public sample personas and the fictional Margaret Wilson case available.

```sh
node scripts/capture-user-guide.mjs
```

By default this uses the local artifact proxy at `http://127.0.0.1:80`, which serves the running Preview app without the hosting platform's extra development banner. An explicit `GUIDE_CAPTURE_URL` may point to that development Preview if needed; production URLs are rejected. Do not copy credentials or private access tokens into the script. It uses the existing Sample accounts controls to authenticate and signs out between personas.

Captures are written to `generated-artifacts/guide-screens/`. Focused content crops preserve the application's synthetic-data disclosure wherever it is within the captured region. The original application content is not rewritten, fabricated or cosmetically relabelled. Dialogs are opened without submitting them. The import example is a two-row fictional CSV parsed in the browser, not an import completion.

The capture session uses a temporary browser profile beneath the ignored output directory and removes it after the browser stops. Never distribute that profile or a login/session export. The screenshot manifest contains no URL credentials.

If a capture fails, investigate the current screen or permission. Do not silently substitute an old or hand-built screen. Review the resulting images and manifest before building a release.

## 2. Generate the offline HTML and blank Excel template

```sh
node scripts/create-user-guide.mjs
```

Every `:::screen name` directive in the Markdown must match an actual PNG in the manifest. Missing or duplicate figures fail explicitly. The output embeds the official fonts, both cover logos and every screenshot; it has no external font/image/network dependency. Selecting a screenshot opens an in-document enlarged view.

Outputs:

- `generated-artifacts/MAHALO-USER-GUIDE.html`
- `generated-artifacts/MAHALO-PATIENT-IMPORT-TEMPLATE.xlsx`

Implementation-guide generation remains separate and does not require screenshot files:

```sh
node scripts/create-user-guide.mjs --implementation
```

## 3. Print the customer PDF

Run from the workspace root:

```sh
chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --no-pdf-header-footer --virtual-time-budget=5000 \
  --print-to-pdf="$PWD/generated-artifacts/MAHALO-USER-GUIDE.pdf" \
  "file://$PWD/generated-artifacts/MAHALO-USER-GUIDE.html"
```

The PDF has clickable chapter contents, numbered figures, running footers and A4 print layout. The offline HTML is the best option for enlarging dense screens; do not magnify a low-resolution screenshot artificially and call it a sharper capture.

## 4. Verify the release

```sh
node --check scripts/capture-user-guide.mjs
node --check scripts/create-user-guide.mjs
node --check scripts/lib/guide-illustrations.mjs
node scripts/check-user-guide.mjs
node scripts/check-guide-offline-browser.mjs
pdfinfo generated-artifacts/MAHALO-USER-GUIDE.pdf
pdffonts generated-artifacts/MAHALO-USER-GUIDE.pdf
```

Inspect the complete PDF at page-thumbnail level and representative pages at reading size: cover, role routes, setup, import, registration, clinical profile, enrollment, plans, patient/caregiver screens, notes/time, billing, reports, files, operations and troubleshooting. Watch for clipped figures, unreadable text, broken tables, empty pages and orphaned end-of-section text. Verify names such as José and Zoë survive PDF extraction and the official fonts remain embedded.

The offline browser check opens the actual local HTML with DNS resolution blocked, verifies every embedded image, opens/closes the enlarged screenshot view and follows a chapter link. It does not sign in to or mutate the application. Verify images finish loading before printing. The generated Excel workbook must still contain Instructions and an empty Patients worksheet.

## Storage and publication boundaries

`generated-artifacts/` is excluded from Git and deployment. Keep screenshot binaries, browser state, generated HTML/PDF, visual-review sheets and print logs there; commit the editable instructions, generator, capture/check scripts and this maintenance document. Distribute only the finished PDF/HTML and optional blank workbook through the artifact Library. Capture files remain available in the workspace for regeneration but are not application public assets.

Do not change real clinical records to make screenshots look complete, reset the existing roster, remove synthetic disclosures or imply that fixtures are live vendor feeds. Application publishing is a separate action and is not needed to regenerate this manual.
