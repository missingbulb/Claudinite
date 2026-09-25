## 2026-08-27 · born · tidy-repo: an improve-comments task and skill (#1384)
- **Reason:** the permission is read from the two contents rather than asserted by the run: on the
  pass's own branch the gate strips comments from both sides of every changed file and reds anything
  left.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** check improve-comments-scope, owned by the tidy-repo pack's
  improve-comments skill rather than by a rule directory, because it validates that skill's own
  action rather than a property of the repo.
- **Landed:** #1384.

## 2026-08-30 · reworded · tidy-repo: improve-comments ignores the .claudinite mount (#1445)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1445.

## 2026-09-07 · moved · Retire the tidy-repo pack; absorb improve-comments into basics (#1842)
- **Reason:** tidy-repo's issue and PR sweeps had been outgrown and the comment pass was the one
  dimension left, which is baseline housekeeping with no second declaration to earn.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the gate moves with its skill to packs/basics/skills/improve-comments/checks.mjs.
- **Landed:** #1842.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-09-25 · scope-changed · only .claudinite/shared/ is refused outright
- **Reason:** follows the improve-comments scope change; a `.claudinite/local/` file is judged
  comment-only like any other.
- **Mechanism:** the gate's mount prefix, pinned to the task's precondition by a test.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
