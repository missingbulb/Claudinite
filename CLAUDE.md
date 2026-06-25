# Claudinite — how to traverse this corpus

**You are reading this because you're working in a repo that uses Claudinite — either this source repo itself, or a consumer that mounted it at `.claudinite/` and imported `@.claudinite/CLAUDE.md`. This file is mostly an index, not a payload: apart from the short always-on baseline below, do not read the whole corpus up front.** Loading every doc would bloat your context with rules irrelevant to the task in front of you. Instead, treat the links below as a **map**, and read a file **only when the task at hand calls for it.**

The links in this file are deliberately **plain relative links, not `@`-imports.** An `@` prefix would force-load the target into context immediately; a plain link is a *soft* pointer — an instruction to go read that file **when, and only when, it's relevant.** Honor that: follow a pointer on demand, don't pre-load it. Keep this same soft style if you add pointers here — never wire the corpus together with `@`-imports.

Read in this order on any given task:

1. **Always-on baseline → the section just below.** A handful of rules that apply to essentially every task; read them every session, before any work. They live inline here, in the always-loaded index, precisely because they're *not* task-gated.
2. **The task-based corpus → [general/](general/).** Durable engineering, agentic, git, and discipline docs, one subject each. Read the specific doc whose subject matches what you're doing (see the list below) — **not** all of them, and only when the task calls for it.
3. **Who you're working with → [preferences/](preferences/).** One file per person who uses Claudinite, **named for that person's email address** (e.g. `preferences/jane@example.com.md`), holding their interaction preferences and trigger phrases. **This is a mandatory read — an exception to the soft-pointer rule above: at session start, before any work, read `preferences/$CLAUDE_CODE_USER_EMAIL.md`** — the file whose name is exactly the current user's email, taken verbatim from the `CLAUDE_CODE_USER_EMAIL` environment variable (`@` and `.` are valid in filenames; no escaping). Read only that file. If no file with that exact name exists, there are no personal preferences to apply — proceed on the general rules alone.
4. **What you're building with → [technologies/](technologies/).** One file per technology (e.g. [Node.js](technologies/nodejs.md), [Chrome extensions](technologies/chrome-extension.md), [Flutter](technologies/flutter.md), [HTML](technologies/html.md)). **Read only the file(s) for the technology the current task actually touches.** Skip this directory entirely for tasks that touch none of them.

## Always-on baseline — read every session, before any work

Unlike everything below, these rules aren't tied to one kind of task, so they're inlined here in the always-loaded index instead of behind a soft pointer.

- **Confirm a behavior isn't already provided before building a mechanism for it** — verify the gap against a real run first; the cheapest fix is often that it already works.
- **Fix build/test/CI warnings, don't tolerate them.** A clean, warning-free run makes a genuinely new warning or error stand out, so noise here costs detection later. Prefer a small, targeted fix that addresses the *cause* in the same change.
- **Suppressing a warning is not a small fix** — muting it with a flag (`--disable-warning`, `eslint-disable`, swallowing it) hides the signal instead of resolving it. Never reach for suppression as the quick path; it's only ever a deliberate, reviewed decision inside the dedicated-issue path below, once the real fix has been weighed and rejected.
- **When a warning can't be fixed now** with a small cause-addressing change without hindering current work (e.g. it's waiting on an upstream release, or the real fix is a larger refactor), open a dedicated issue for it (unless one's already open) so it's tracked and not lost — then move on. Resolving it (real fix, or a consciously-chosen suppression) happens in that issue's own change.
- **An approval applies only *backward*** — to the work already in front of the owner when it's given, never to anything requested or done *after* it. A later follow-up, even a fix to the just-approved change, needs its own explicit approval; don't carry one approval forward, and don't treat a chosen answer to a multiple-choice prompt as authorization just because an option's wording mentioned the action. When in doubt, surface the new state and wait for a fresh approval.
- **Every new task follows the same lifecycle:** (1) create a GitHub issue describing the task before starting work; (2) develop on a branch, referencing that issue number in commit messages (`Refs #123`, `Fixes #123`, `Closes #123`); (3) update the issue's status (comments / close) as work progresses and when it's done. The rest of the git/GitHub procedures — commit-in-layers, CI-trigger rules, merge gotchas — stay task-based in [general/git-and-github.md](general/git-and-github.md).

### general/ — the task-based corpus (read the doc that matches your task)

Each line names the trigger that should send you to the doc — match it against the task in front of you, and read the doc *before* acting when it fires.

- [general/engineeringPractices.md](general/engineeringPractices.md) — **Read before writing or editing code.** Naming by scope, single-source-of-truth with drift guards, GENERATED-file discipline, earning each dependency, verifying real platform behavior, fresh-checkout install errors.
- [general/bug-investigations.md](general/bug-investigations.md) — **Read when investigating a bug, or when a fix didn't hold.** Version-gap triage before theorizing, re-deriving the cause after a recurrence, getting one real datapoint before broadcasting a theory.
- [general/filePlacement.md](general/filePlacement.md) — **Read before placing, moving, or renaming a file, or when reviewing where one lives.** The reference-distance metric (keep references at distance 0/1), the high-reach code smell, and the mandated-location (`.github/`, `.claude/`, root manifests) and test-location exemptions.
- [general/textAndFileManipulation.md](general/textAndFileManipulation.md) — **Read before a grep/sed sweep, a rename, or a path relocation.** Scoping a replace, searching segment tokens after a rename, Markdown links that carry the path twice, references that break with no test failure.
- [general/testingPractices.md](general/testingPractices.md) — **Read before writing or changing a test.** See-it-fail discipline, driving snapshots/goldens through the real code path, CI-only and heavy-browser tests, fuzzy-metric high-watermark gating.
- [general/agenticBestPractices.md](general/agenticBestPractices.md) — **Read when building or running an AI agent or unattended routine.** The daily lessons pass, matching model to judgment, per-routine tracking issues, doc-not-inlined instructions, post-task efficiency analysis.
- [general/extracting-lessons.md](general/extracting-lessons.md) — **Read when running a retrospective / lessons pass over a session.** The friction signals (clarifying round-trips, backtracks, long waits), the durable-and-reusable bar, and "no new lessons" as a valid result.
- [general/git-and-github.md](general/git-and-github.md) — **Read when doing git/GitHub work beyond the baseline lifecycle** — committing in layers, recovering a branch after a squash-merge, dispatching CI, resolving a merge. CI-trigger rules, the `GITHUB_TOKEN` recursion gotcha, merge-relocation traps.
- [general/agent-architecture.md](general/agent-architecture.md) — **Read before structuring an unattended (automation-invoked) agent.** Leave it only the judgment step and hard-code the rest; bound its write surface and enforce that from outside with a post-hoc diff check.

### preferences/ — per-user interaction preferences

**At session start, read `preferences/$CLAUDE_CODE_USER_EMAIL.md`** — the single file whose name is exactly the current user's email (from the `CLAUDE_CODE_USER_EMAIL` environment variable, used verbatim — `@` and `.` need no escaping). Read only that file; other users' preferences don't apply. If no file with that exact name exists, there are none to apply.

### technologies/ — per-technology practices

- [technologies/nodejs.md](technologies/nodejs.md) · [technologies/chrome-extension.md](technologies/chrome-extension.md) · [technologies/flutter.md](technologies/flutter.md) · [technologies/html.md](technologies/html.md)

---

For what this repo *is*, how consuming repos mount it, and its internal maintenance routines, see [README.md](README.md).
