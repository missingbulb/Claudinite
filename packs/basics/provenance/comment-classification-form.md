## 2026-09-06 · born · Promote the reviewed survivors of nine growth-promote PRs (#1671)
- **Reason:** the form of the declared class line is checkable where the judgment behind it is not.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check comment-classification-form, in
  packs/basics/workRules/comment-classification-form.mjs.
- **Landed:** #1671 · pack version 60906.4.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
