## 2026-07-17 · born · Add product-wiki pack: the self-growing product research wiki standard (#301)
- **Source:** the standard missingbulb/GoogleCalendarEventCreator had just adopted (its #678) - the
  LLM-wiki pattern Karpathy described: compile findings once, refine in place, cite everything, keep
  a dated growth log.
- **Reason:** a declared standard with no scaffold silently enforces nothing - the isolation wall
  and the wiki discipline both hang off these fixed paths.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a coded check over the skeleton, accepting a freshly written file as well as a
  tracked one so a scaffold in progress is not flagged.
- **Landed:** #301 (Refs #302) · pack version 1.

## 2026-08-16 · converted · Three vocabulary enhancements - no new key families - and the five conversions they unlock (#891)
- **Reason:** the skeleton's path requirements are data, but the takes-no-config guard riding the
  same id is not: it judges the normalized config, which no declaration over the raw settings file
  sees in one place. Splitting the two also heals the limit the pack had recorded - turning the
  layout rule off no longer silences the guard.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a requirePaths declaration under the existing id in declared-checks.json, with the
  config guard split off as a coded rule of its own.
- **Landed:** #891 (Refs #880).

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
