# claudinite — change record

Every change automatic work makes to this pack, newest first: a prose rule added or removed, a
check created, a rule corrected against a probe or deleted as irrelevant. The row is written in
the same PR as the change it describes, so this file diffs beside it.

A run that changed nothing writes no row — this is the log of what happened to the pack, never a
log of runs.

| Date | Task | Change |
|---|---|---|
| 2026-08-24 | owner request | Audited the whole file with the `authoring-agent-docs` method: stripped per-rule incident archaeology (issue ids, dates, quoted exchanges) that `VERSIONS.md` and the issues already keep, keeping a measurement only where the number is the argument. 8,435 → 7,612 words, every rule's strength unchanged (#1312). |
| 2026-08-24 | owner request | Split: **Creating the artifact a check will demand** — create it before the action it gates; was a trailing clause of the mechanize-a-procedure rule, and a reader can arrive at it without that one (#1312). |
| 2026-08-24 | owner request | Removed: **Writing check-the-work** — `basics` already carries see-it-fail as the ladder rule, and both load in the same session (#1312). |
| 2026-08-24 | owner request | Removed: **Judging whether a member is fresh** — contradicted `claudinite-lifecycle`'s corrected form, which rules out `ref` along with `claudinite.updated` (#1312). |
| 2026-08-24 | owner request | Stripped: **Diagnosing a member's maintenance PR that won't land** — down to the `unstable`-is-a-parked-run diagnosis; the rest was `claudinite-lifecycle`'s mount-did-not-update rule verbatim (#1312). |
| 2026-08-24 | owner request | Carried out: the `packs/* → .claudinite/local` barrier gap, which was sitting as a TODO inside a rule, is now #1313 (#1312). |
| 2026-08-24 | `growth-extract` | Added: **Opening a queue work-item's own delivered PR** — never carry `Closes #<the item's own issue>`; convergence, not merge, is what closes or parks it (#1275). |
| 2026-08-24 | `growth-extract` | Added: **Re-waiting on a signal that already failed to move on the first wait** — read the code that governs when it can change before waiting a second time on the same premise (#1293). |
| 2026-08-24 | `growth-extract` | Extended: **Running the test suite** — `git ls-files` also silently excludes a just-created, unstaged test file, so a green run may never have executed it (#1274). |
| 2026-08-23 | owner request | Added check: **`scheduler-workflows-are-thin`** — the scheduler/executor workflows carry no inline program (no `github-script`, no block `run:`); logic belongs in an engine module they name, because a converge cannot push to `.github/workflows/` (#1289). |
| 2026-08-23 | `growth-extract` | Added: **Sending a screenshot from a scratch test harness** — caption it as such, or the reader assumes it's the live page (#1249). |
| 2026-08-23 | `growth-extract` | Added: **A canon pack's prose naming another pack by literal path** — must resolve in every consumer's vendored tree, not just the canon home; a live dangling instance flagged for a future `barriers` fix (#364). |
| 2026-08-23 | `growth-extract` | Added: **Verifying a bulk sweep preserved content** — check a structural invariant count before/after; a green suite alone missed 46 silently-truncated test files (#1246). |
| 2026-08-23 | `growth-extract` | Added: **A regex import-path rewriter for a bulk sweep** — anchor to real import syntax, never a bare pattern over the whole file text, or it corrupts fixture strings that embed import syntax as data (#1246). |
