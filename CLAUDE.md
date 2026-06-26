# Claudinite — corpus index

> 🛑 **STOP — this is your first action, before anything else in this file or this session.**
> Before you answer, plan, or call any tool — including for a request that looks trivial or one-off —
> you MUST read `preferences/$CLAUDE_CODE_USER_EMAIL.md` (substitute the env var's value; that one file only).
> Treat it as a precondition: if you have not read it, you are not ready to act. "It's just a quick message"
> is exactly the case this gate exists to catch.
> No such file → no personal preferences; proceed. Then continue with the index below.

**Routing index, not a payload. Do not read the corpus up front.** Read a file only when its trigger below fires. Links are soft pointers — read on demand, never pre-load — except the always-on baseline, which is `@`-imported and loads every session. Keep new pointers soft; never `@`-import `tasks/`.

## always/ — loads every session (force-loaded via `@`; nothing to decide)

@always/working-discipline.md
@always/task-lifecycle.md

Every file in `always/` is `@`-imported here — add an `@`-line when you add one.

## preferences/ — imperative: read at session start, before any work

Read `preferences/$CLAUDE_CODE_USER_EMAIL.md` — that file only, its name the current user's email taken verbatim from `CLAUDE_CODE_USER_EMAIL` (`@` and `.` need no escaping). **Skipping it is all but certain to cause problems: you act without the trigger phrases and conventions the user relies on.** No such file → no personal preferences; proceed.

## technologies/ — read only the file(s) the task touches; otherwise skip

[Node.js](technologies/nodejs.md) · [Chrome extension](technologies/chrome-extension.md) · [Flutter](technologies/flutter.md) · [HTML](technologies/html.md)

## tasks/ — read the matching doc *before* acting; match the trigger to the task in front of you, not the topic

- [tasks/engineeringPractices.md](tasks/engineeringPractices.md) — **Read before writing or editing code.** Naming by scope, single-source-of-truth with drift guards, GENERATED-file discipline, earning each dependency, verifying real platform behavior, fresh-checkout install errors.
- [tasks/bug-investigations.md](tasks/bug-investigations.md) — **Read when investigating a bug, or when a fix didn't hold.** Version-gap triage before theorizing, re-deriving the cause after a recurrence, getting one real datapoint before broadcasting a theory.
- [tasks/filePlacement.md](tasks/filePlacement.md) — **Read before placing, moving, or renaming a file, or when reviewing where one lives.** The reference-distance metric (keep references at distance 0/1), the high-reach code smell, and the mandated-location (`.github/`, `.claude/`, root manifests) and test-location exemptions.
- [tasks/textAndFileManipulation.md](tasks/textAndFileManipulation.md) — **Read before a grep/sed sweep, a rename, or a path relocation.** Scoping a replace, searching segment tokens after a rename, Markdown links that carry the path twice, references that break with no test failure.
- [tasks/testingPractices.md](tasks/testingPractices.md) — **Read before writing or changing a test.** See-it-fail discipline, driving snapshots/goldens through the real code path, CI-only and heavy-browser tests, fuzzy-metric high-watermark gating.
- [tasks/agenticBestPractices.md](tasks/agenticBestPractices.md) — **Read when building or running an AI agent or unattended routine.** The daily lessons pass, matching model to judgment, per-routine tracking issues, doc-not-inlined instructions, post-task efficiency analysis.
- [tasks/extracting-lessons.md](tasks/extracting-lessons.md) — **Read when running a retrospective / lessons pass over a session.** The friction signals (clarifying round-trips, backtracks, long waits), the durable-and-reusable bar, and "no new lessons" as a valid result.
- [tasks/git-and-github.md](tasks/git-and-github.md) — **Read when doing git/GitHub work beyond the baseline lifecycle** — committing in layers, recovering a branch after a squash-merge, dispatching CI, resolving a merge. CI-trigger rules, the `GITHUB_TOKEN` recursion gotcha, merge-relocation traps.
- [tasks/agent-architecture.md](tasks/agent-architecture.md) — **Read before structuring an unattended (automation-invoked) agent.** Leave it only the judgment step and hard-code the rest; bound its write surface and enforce that from outside with a post-hoc diff check.

---

Repo internals — what this repo is, how consumers mount it, the maintenance routines → [README.md](README.md).
