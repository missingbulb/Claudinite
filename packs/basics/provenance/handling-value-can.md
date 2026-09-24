## 2026-08-11 · born · growth-promote: dedupe PR #740's rule additions and cut the language (#751)
- **Source:** the seven growth branches PR #740 merged, re-derived against current `main`.
- **Reason:** a stage that folds three states into two loses what nothing downstream can recover,
  and it fails silently because every value it emits is plausible.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule.
- **Rejected:** patching #740's own branch. Its base was 40 commits behind `main` and edited a
  `RULES.md` that still had the engineering-practices bullets in a separate skill file, and its
  merge had left several lessons standing two and three times.
- **Landed:** #751.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Handling a value that can be unknown".
- **Landed:** #760, closing #759 · pack version 1.
