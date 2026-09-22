## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Reason:** the in-repo observer for the unattended growth channel having silently stopped firing.
  Advisory rather than blocking because it is time-driven: a repo goes stale with no change to its
  tree, and a wall-clock-dependent finding must never block a Stop or fail CI.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a coded check on the newest dated growth-log entry, with an injectable clock so the
  45-day boundary is pinned by test and a far-future typo cannot mark a page fresh forever.
- **Landed:** #301 (Refs #302) · pack version 1.

## 2026-08-14 · converted · Pattern-check engine: markdown-section assertions (the product-wiki page grammar) (#825)
- **Reason:** the markdown-section grammar these checks shared becomes engine mechanism, computed
  once per file for the whole rule family, and a page's whole grammar then reads directly off the
  declaration. Ids, severities and messages carried over verbatim: all forty pack tests passed
  unchanged and the world sweep was identical with and without the change.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a checkSections declaration in place of the coded module, with a whole-repo
  relevance gate so the time-driven advisory runs only on a full sweep.
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
