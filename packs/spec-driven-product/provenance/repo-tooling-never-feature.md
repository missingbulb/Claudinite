## 2026-09-22 · born · a process change armed doc-first against a leaf that cannot exist (#1886)
- **Source:** EdFringeNow, where a repo-tooling change was classified `feature` and the doc-first
  gate went red with no product requirement leaf to point it at.
- **Reason:** the three comment classes are not interchangeable at the gate. `feature` is the only
  one that arms doc-first, and it arms it against a requirements leaf, so a change with no product
  requirement behind it - tooling, process, CI - can never satisfy what the classification promised.
  The second failure is the one worth naming: once the gate is armed wrongly, a backdated token spec
  commit or a coverage-allowlist entry makes it green while leaving the misclassification in the
  record, which is worse than the red it hides.
- **Mechanism:** prose in this pack's RULES.md, keyed to the act of classifying, since the mistake
  is made at classification time and no check can see which class a comment deserved.
- **Retire when:** the classification stops arming doc-first, or the gate learns to tell a change
  with no requirements leaf from one whose leaf is merely missing.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
