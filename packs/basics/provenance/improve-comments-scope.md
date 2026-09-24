## 2026-08-27 · born · tidy-repo: an improve-comments task and skill (#1384)
- **Reason:** the permission is read from the two contents rather than asserted by the run: on the
  pass's own branch the gate strips comments from both sides of every changed file and reds anything
  left.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check improve-comments-scope, in packs/basics/skills/improve-comments/checks.mjs.
- **Landed:** #1384.

## 2026-08-30 · reworded · tidy-repo: improve-comments ignores the .claudinite mount (#1445)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1445.
