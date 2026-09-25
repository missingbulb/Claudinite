## 2026-09-25 · born · a bulk terminology rename outran what the owner actually approved (#673)
- **Source:** PR #659 (session 1766927e, 2026-09-25T11:42-15:48Z). An `AskUserQuestion` framed
  "provenance" as naming exactly one of two features; the owner's free-text answer ("claudinite.com
  is wrong") was read as covering every site occurrence of the word, and the rename ("audit trail")
  landed across all of them. The owner then corrected it: most occurrences meant the still-current
  rule-provenance sense, and only four (the preview table's last-update column, its aria-label, its
  CSS comment, R7's supply-chain line) meant the renamed feature. Reverting the wrong ones took two
  further passes (commits 62b7d57 revert, then a second AskUserQuestion to pin the last four).
- **Reason:** the question's two-feature framing didn't require classifying each of the ~10 existing
  "provenance" occurrences before the answer was applied to all of them.
- **Actor:** the owner, via the session's self-correction after the owner's 13:33
  message.
- **Model:** Claude Opus 5.5, per the PR's commit trailers.
- **Mechanism:** a RULES.md rule — the moment (a site-wide word rename following an owner
  decision) has no single file-edit trigger to force-load a skill on.
- **Retire when:** no longer true that this repo's terminology-reconciliation work applies a
  decision by feature/category rather than by occurrence.
- **Landed:** #673.

## 2026-09-25 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
