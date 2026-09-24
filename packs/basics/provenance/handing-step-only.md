## 2026-08-11 · born · growth-promote: dedupe PR #740's rule additions and cut the language (#751)
- **Source:** the seven growth branches PR #740 merged, re-derived against current `main`.
- **Reason:** a note in the PR body merges and disappears with the PR while the setting stays
  unflipped.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule. #740 had added it to both `basics/RULES.md` and
  `git-github-advanced`; one home was kept.
- **Rejected:** patching #740's own branch. Its base was 40 commits behind `main` and edited a
  `RULES.md` that still had the engineering-practices bullets in a separate skill file, and its
  merge had left several lessons standing two and three times.
- **Landed:** #751.

## 2026-08-12 · reworded · Rewrite RULES.md as situation-keyed rules, and write down the method (#760)
- **Actor:** @missingbulb (owner).
- **Mechanism:** a RULES.md rule, triggered on "Handing over a step only a human can perform".
- **Landed:** #760, closing #759 · pack version 1.

## 2026-08-16 · reworded · Audit basics/RULES.md, and teach authoring-agent-docs what this rewrite needed (#894)
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Landed:** #894 · pack version 3.

## 2026-08-31 · reworded · writing-handover-issues: the checklist is the artifact (#1532)
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1532 · pack version 60831.5.
