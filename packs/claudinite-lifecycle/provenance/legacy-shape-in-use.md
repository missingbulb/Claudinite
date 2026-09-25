## 2026-09-03 · born · telling the repo that still holds a legacy shape (#1645)
- **Source:** an audit of about 28 legacy declaration sites across the engine and the packs, none
  with a scheduled removal and one carrying a stated end date that had passed with nothing arranged
  to notice.
- **Reason:** every tolerance in the tree was silent. A member reading its own declaration had no
  way to learn it was on a shape scheduled for removal, and the removal is gated on those members
  letting go.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a world advisory firing in the repo that holds the old shape rather than in the
  canon that tolerates it, naming the edit that moves it forward. Permanently advisory: the old
  shape works, so it may not stop a member's build. Every engine constant it reads is
  namespace-imported and guarded, because the two lanes converge on separate cycles and this pack
  spends windows beside an engine that predates one of the symbols.
- **Landed:** #1645 (Closes #1637) · pack version 60903.3.

## 2026-09-03 · reworded · it states the window the repo has to act (#1652)
- **Reason:** claiming the removal waits on nobody carrying the shape makes the finding sound
  optional, and the canon cannot see which repos are active anyway.
- **Actor:** @missingbulb (owner).
- **Landed:** #1652 · pack version 60903.4.

## 2026-09-21 · reaffirmed · the advisory outlives the constant it was named for
- **Source:** the fourth of the residues #1643 lists, read while the `updates` mechanism alias left
  `engine/served-by.mjs`.
- **Reason:** the rule read the alias off `servedBy.LEGACY_MECHANISM`, so deleting that constant
  would have made the advisory inert at the moment it became the only thing still watching for the
  shape - retiring the warning together with the thing it warns about. A member file that still says
  `updates` is exactly what the rule exists to find, and the value is historical and cannot move, so
  it is carried as a literal instead of read from the engine. The remedy text changed with it: the
  declaration no longer reads as one spelling of two the flows still serve, it reads as
  unrecognised, resolving to the default rather than to anything the repo said.
- **Actor:** @missingbulb (owner), through the queue item implementing #1643.
- **Landed:** #1917 (Refs #1643; the work item's own converge closes that issue, so the body carries
  no closing keyword).

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

## 2026-09-25 · scope-changed · also names a check's retired `severity` spelling
- **Reason:** `severity: blocking|advisory` became `on_fail: block|advise` (owner decision,
  2026-09-25); the engine still reads the old spelling in a settings override, a local pack's
  declared check and a local pack's coded check, and a tolerance needs an advisory reaching whoever
  holds it.
- **Actor:** @missingbulb (owner).
- **Mechanism:** this check: it already owns every declaration-shape tolerance's advisory, and it
  reads the member's own files only, so a vendored pack's old spelling is left to that pack's
  update.
