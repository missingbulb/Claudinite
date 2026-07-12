---
name: merge-to-main
description: Merge the change in front of the owner into main. Use when the owner says "LGTM" or asks to merge/land the current branch or PR into main.
---


The portable recipe for landing the change in front of the owner on `main` — the *mechanics* behind the owner's merge-to-main command (the owner's preferences own the trigger *phrase*; this file owns the *how*). Invoked through the `merge-to-main` skill (this skill); this doc stays the canonical recipe.

**A project's bespoke merge policy overrides this default.** Most projects need nothing here — this default is the whole story. A project that genuinely diverges (a different merge method, a CI/twice-green gate, an extra approval) **states so by naming its merge-policy file explicitly in its own `CLAUDE.md`**. When that declaration is present, read that file first and let it override the divergent points below; when it's absent, follow this default as-is. Don't go hunting for a policy file that the project's `CLAUDE.md` doesn't name.

## Recipe (~4 calls)

1. Load both GitHub tools in **one** `ToolSearch`: `create_pull_request` + `merge_pull_request`.
2. No PR open for the branch yet? `create_pull_request` (base `main`); end the body with `Closes #<issue>`, and take the PR number from the returned URL.
3. Gate on CI **only if the repo has it** — a workflow that actually runs on PRs/pushes. `workflow_call`-only reusable workflows (this repo hosts some) are *not* CI: they never run here, so a non-empty `.github/workflows/` alone proves nothing; check the PR for check runs instead. No CI → no gate; don't wait for checks that will never come.
4. `merge_pull_request`, `merge_method: squash`, title `<subject> (#<pr>)`. Merge directly — don't pre-read status; the call fails loudly if it isn't mergeable.
5. Sync local `main`: `git checkout main && git pull origin main`.

The two divergent points — **`squash`** as the method and **CI gating** — are exactly what a bespoke policy file changes.

## After the merge: reflect (every session, every user)

Once the merge has landed and local `main` is synced, run a **lessons-learned pass** over the session that just closed, per [extracting-lessons.md](../lessons-learned/extracting-lessons.md) (which owns the method). The point here is only the **trigger**: it fires on **every** merge to `main`, for **every** user — not only when someone asks.

**Skip it only when the merge you just landed *is itself* a lessons-pass PR** — reflecting on a reflection has nothing new to mine, and skipping keeps the trigger from looping on its own output.

## Don't

- **Don't** re-read the issue to confirm it closed — `Closes #<issue>` does that on merge; trust it.
