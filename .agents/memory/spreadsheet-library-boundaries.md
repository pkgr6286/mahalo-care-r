---
name: Spreadsheet library boundaries
description: A real-workbook compatibility issue that TypeScript alone did not describe correctly.
---
Do not assume an Excel reader's old return shape or accept its cell types without a runtime check.

**Why:** read-excel-file v9 returns an array of named sheets, not a single matrix. Its sheet-cell typings describe `typeof Date` even though real Excel date cells arrive as Date instances. Blind casts would hide the mismatch; a browser workbook confirmed the real values and leading-zero text identifiers.

**How to apply:** When changing the reader/version, test a real multi-sheet workbook containing dates and text MRNs/phone numbers. Keep worksheet selection explicit and reject unsupported cell objects rather than silently stringifying them.
