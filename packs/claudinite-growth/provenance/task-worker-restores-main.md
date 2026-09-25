## 2026-09-06 · born · Promote the validated survivors of four growth-promote PRs (#1828)
- **Reason:** one executor run drains several items from one checkout, so a worker that leaves a
  branch checked out hands the next item a tree it did not expect.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** check task-worker-restores-main, in
  packs/claudinite-growth/worldRules/task-worker-restores-main.mjs.
- **Landed:** #1828 · pack version 60906.7.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
