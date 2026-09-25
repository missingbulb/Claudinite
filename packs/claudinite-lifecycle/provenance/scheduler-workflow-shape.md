## 2026-07-22 · born · the scheduler workflow a member must carry (#396)
- **Source:** per-project maintenance scheduling, phase 0.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a coded rule in the `basics` pack, checking the vendored scheduler workflow's shape
  in the member that carries it.
- **Landed:** #396 (Refs #394).

## 2026-08-14 · moved · out of basics into this pack (#836)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the rule judges whether a member is scheduled, which is this pack's scope.
- **Landed:** #836 (Closes #835, phase 1).

## 2026-08-15 · converted · into a declared check (#845)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a row in this pack's `declared-checks.json`, using the vocabulary keys this change
  added.
- **Landed:** #845 (Refs #843).

## 2026-08-24 · severity-changed · the legacy hourly cron line stops being accepted (#1234)
- **Reason:** every member's workflow now carries the two-tick form, so the tolerance has nothing
  left to tolerate.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the accepted cron shapes alone; the check's severity and scope are unchanged.
- **Landed:** #1234 (Refs #1233) · pack version 60824.5.

## 2026-08-24 · severity-changed · the pack's scheduler entry is required (#1328)
- **Reason:** every member's workflow names it now, so accepting the legacy engine path alongside it
  would keep a stale shape readable as correct.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the entry path the check demands; severity unchanged.
- **Landed:** #1328 · pack version 60824.6.

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
