---
name: repo-text-sweeps
description: Mechanics for grep/sed sweeps, renames, and path relocations across a repo. Use before a bulk find-replace, a rename, or moving files — and after one, to catch silently broken references.
---

Follow [tasks/textAndFileManipulation.md](../../tasks/textAndFileManipulation.md) — canonical
there. The `reference-integrity` and `markdown-link-labels` conformance checks catch the
breakage classes post-hoc; the doc carries the sweep technique that avoids creating them.
