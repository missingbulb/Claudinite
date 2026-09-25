## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a coded check requiring each growth-log bullet to lead with a real calendar date,
  over the shared bullet grammar that covers the three bullet markers alike.
- **Landed:** #301 (Refs #302) · pack version 1.

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

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
