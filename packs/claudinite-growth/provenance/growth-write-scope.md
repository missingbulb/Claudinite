## 2026-08-12 · born · Growth dedup: method moves into a pack skill; growth-write-scope gates the capture runs' write surface (#492)
- **Reason:** both capture runs auto-merge, so nothing human reviews a run that reaches outside the
  local packs; a merged run had already edited `packs/README.md`.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check growth-write-scope, in
  packs/claudinite-growth/workRules/growth-write-scope.mjs.
- **Landed:** #492 (Closes #491).

## 2026-09-15 · scope-changed · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the check's commit-title trigger widens from the two capture runs to all four
  growth runs, the sweeps having become the same write surface.
- **Landed:** #2047 (Closes #2044).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
