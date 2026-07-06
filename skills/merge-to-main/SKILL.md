---
name: merge-to-main
description: Merge the change in front of the owner into main. Use when the owner says "LGTM" or asks to merge/land the current branch or PR into main.
---

Follow the recipe in [always/merge-to-main.md](../../always/merge-to-main.md) — it stays
canonical there. In short: squash-merge via a PR (body ending `Closes #<issue>`), gate on CI
only when the repo has one, honor a bespoke merge-policy file when the project's `CLAUDE.md`
names one, sync local `main`, then run the lessons pass (the `lessons-learned` skill) — skipped
only when the merged change is itself a lessons-pass PR.
