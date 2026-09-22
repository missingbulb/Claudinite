## 2026-07-29 · born · product-wiki: every wiki page opens with a Key insights header (#542)
- **Reason:** a compiled research page is only useful if a human can get its findings without
  reading it end to end, so every page opens with what it found.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a coded check owning the header's shape - first on the page, bullets only, one to
  seven, none past 140 characters with a bullet's indented continuations counted as part of it, so
  hard-wrapping is free and a wrapped paragraph cannot hide. The cap is the point: a header earns
  its place only if it is faster to read than the page, and the failure mode in practice is a bullet
  that keeps qualifying itself. Which insights lead, and how plainly they are worded, stays judgment
  no check can score.
- **Rejected:** a 300-character cap, which the first cut allowed; rewritten terse, the same findings
  fit in 66 to 93 characters, so 140 has headroom for an honest line while cutting a paragraph off
  at the knees.
- **Retire when:** retire if the header stops being the page's reader surface.
- **Landed:** #542 (Closes #543) · pack version 1.

## 2026-08-14 · converted · Pattern-check engine: markdown-section assertions (the product-wiki page grammar) (#825)
- **Reason:** the markdown-section grammar these checks shared becomes engine mechanism, computed
  once per file for the whole rule family, and a page's whole grammar then reads directly off the
  declaration. Ids, severities and messages carried over verbatim: all forty pack tests passed
  unchanged and the world sweep was identical with and without the change.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a checkSections declaration in place of the coded module.
- **Landed:** #825 (Closes #824).

## 2026-08-14 · moved · Declared checks are JSON, one file per pack (#827)
- **Reason:** a declaration is a table row, not a module. A pack's declarations become the array in
  its own JSON file, discovered structurally - no import, no manifest line, so writing the
  declaration adds the check - and the format sheds what it was borrowing from prose: no comments,
  which JSON enforces by construction, no description, and no doc pointer, since a declaration
  states its own case.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the declaration moves into the pack's declared-checks.json.
- **Landed:** #827 (Closes #826) · pack version 2.

## 2026-09-22 · policy-changed · one settings-file name, now the rename's window has passed (#1919)
- **Reason:** `.claudinite-checks.json` was read everywhere beside `.claudinite-settings.json` while
  members converged onto the new name, and every reader that asked "is this the declaration" carried
  its own copy of the two-name loop. The convergence window `legacy-shape-in-use` opened has passed,
  so each of those readers now names one file. A member still carrying the retired name reads as
  having no declaration at all - the stated cost of the retirement, and why its policy is nothing.
- **Mechanism:** the reader takes `SETTINGS_FILE` rather than iterating `SETTINGS_FILES`, which is
  now a one-element list kept only as a link-time shim for fielded pack versions (#1911).
- **Actor:** claudinite/engine implement-request run, rebased and reconciled in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1919
