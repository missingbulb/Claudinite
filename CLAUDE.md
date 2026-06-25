# Claudinite — how to traverse this corpus

**You are reading this because you're working in a repo that uses Claudinite —
either this source repo itself, or a consumer that mounted it at `.claudinite/`
and imported `@.claudinite/CLAUDE.md`. This file is an index, not a payload — do
not read the whole corpus up front.** Loading every doc would bloat your context
with rules irrelevant to the task in front of you. Instead, treat the links below
as a **map**, and read a file **only when the task at hand calls for it.**

The links in this file are deliberately **plain relative links, not `@`-imports.**
An `@` prefix would force-load the target into context immediately; a plain link
is a *soft* pointer — an instruction to go read that file **when, and only when,
it's relevant.** Honor that: follow a pointer on demand, don't pre-load it. Keep
this same soft style if you add pointers here — never wire the corpus together
with `@`-imports.

Read in this order on any given task:

1. **Always-on baseline → [general/](general/).** The durable engineering,
   agentic, git, and discipline rules that apply to essentially any task. Read
   the specific doc whose subject matches what you're doing (see the list below);
   you don't need to read all of them for every task, but this directory is where
   the default working rules live.
2. **Who you're working with → [preferences/](preferences/).** One `<user>.md`
   file per person who uses Claudinite, holding that person's interaction
   preferences and trigger phrases. **Read the file matching the current user**
   (identify them from the session / git `user.email`), and only that file. Today
   the only such file is [preferences/missingbulb.md](preferences/missingbulb.md)
   (the repo owner). If no file matches the current user, there are no personal
   preferences to apply — proceed on the general rules alone.
3. **What you're building with → [technologies/](technologies/).** One file per
   technology (e.g. [Node.js](technologies/nodejs.md),
   [Chrome extensions](technologies/chrome-extension.md),
   [Flutter](technologies/flutter.md), [HTML](technologies/html.md)). **Read only
   the file(s) for the technology the current task actually touches.** Skip this
   directory entirely for tasks that touch none of them.

### general/ — the always-applicable corpus

- [general/engineeringPractices.md](general/engineeringPractices.md) — general software-engineering practices, independent of any one project.
- [general/bug-investigations.md](general/bug-investigations.md) — how to investigate a bug and pin down its root cause (version-gap triage, re-deriving the cause after a failed fix, probing for one real datapoint before broadcasting a theory).
- [general/filePlacement.md](general/filePlacement.md) — where files should live in a repo: the reference-distance metric (keep references at distance 0/1), the high-reach code smell, and the mandated-location exemption (`.github/`, `.claude/`, root manifests) and the test-location exemption (don't move files to shorten test references — defer to the project's test-location standard).
- [general/textAndFileManipulation.md](general/textAndFileManipulation.md) — mechanics of searching, extracting, and rewriting text across files (grep/sed sweeps, renames, broken references).
- [general/testingPractices.md](general/testingPractices.md) — practices for writing trustworthy tests (see-it-fail, snapshot/golden discipline, CI-only and heavy-browser tests, coverage gating).
- [general/agenticBestPractices.md](general/agenticBestPractices.md) — durable, project-agnostic practices for building and running AI agents.
- [general/extracting-lessons.md](general/extracting-lessons.md) — how to mine a working session for durable improvements (misunderstandings, suboptimal actions, long waits) so the next run needs less.
- [general/git-and-github.md](general/git-and-github.md) — portable git & GitHub procedures (task lifecycle, commit history, CI-trigger rules, merge gotchas).
- [general/working-discipline.md](general/working-discipline.md) — general working habits (confirm-before-building, the warnings policy).
- [general/agent-architecture.md](general/agent-architecture.md) — structural rules for unattended, automation-invoked agents.

### preferences/ — per-user interaction preferences

**Read only `preferences/<CURRENT_USER_NAME>.md`** — the single file matching the
current user (resolve `<CURRENT_USER_NAME>` from the session / git `user.email`).
Do **not** read the other users' files; their preferences don't apply to this
session. If no file matches the current user, there are none to apply.

Files present today:

- [preferences/missingbulb.md](preferences/missingbulb.md) — the repo owner's personal interaction preferences and trigger phrases.

### technologies/ — per-technology practices

- [technologies/nodejs.md](technologies/nodejs.md) · [technologies/chrome-extension.md](technologies/chrome-extension.md) · [technologies/flutter.md](technologies/flutter.md) · [technologies/html.md](technologies/html.md)

---

For what this repo *is*, how consuming repos mount it, and its internal
maintenance routines, see [README.md](README.md).
