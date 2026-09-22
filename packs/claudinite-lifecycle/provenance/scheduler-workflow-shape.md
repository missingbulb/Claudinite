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
