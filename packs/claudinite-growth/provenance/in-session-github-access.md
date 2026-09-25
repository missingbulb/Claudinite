## 2026-09-13 · born · in-session code reaching GitHub by REST cannot authenticate there
- **Source:** the `routines-session-steps` guideline this check enforces. The date is a floor: the
  clone here is shallow and its history begins 2026-09-13.
- **Mechanism:** a blocking declared check - the failure is silent, so prose could not catch it.

## 2026-09-22 · scope-changed · the scope named two root folders this tree has never had (#2245)
- **Source:** the first production usage review (#2237).
- **Reason:** neither `routines/` nor `migrations/` exists at the root, so the check selected
  nothing while reading as blocking. Routines have no home here at all.
- **Mechanism:** the same regex, over `migrations/` anywhere.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
