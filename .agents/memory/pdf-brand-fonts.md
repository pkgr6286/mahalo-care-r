---
name: PDF brand-font verification
description: Why document font tests must include realistic identifiers, ligatures and accents.
---
Browser-compatible WOFF2 is not sufficient evidence that the same font can be embedded into generated PDFs.

**Why:** PDFKit/fontkit accepted the brand font in a small ASCII-only PDF test but failed during font subsetting with realistic chart text and composite glyphs. Browser rendering continued to work, so frontend checks could not reveal the problem.

**How to apply:** Keep a PDF-safe static font instance in the same official typeface, and test patient identifiers, mixed-case text, ligatures and accented characters. Do not replace the brand with an unrelated fallback or remove those regression cases.
