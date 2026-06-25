# Claudinite

Portable Claude instructions/rules shared across projects — the
**project-agnostic** maintainer guidelines, maintained **once** here and mounted
into each consuming repo so they don't have to be copy-pasted per project.
Project-*specific* rules stay in the consuming repo's own docs.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

---

## For the reading agent: how to traverse this corpus

**You are reading this because the consuming repo imported it. This file is an
index, not a payload — do not read the whole corpus up front.** Loading every
doc would bloat your context with rules irrelevant to the task in front of you.
Instead, treat the links below as a **map**, and read a file **only when the task
at hand calls for it.**

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
- [general/textAndFileManipulation.md](general/textAndFileManipulation.md) — mechanics of searching, extracting, and rewriting text across files (grep/sed sweeps, renames, broken references).
- [general/testingPractices.md](general/testingPractices.md) — practices for writing trustworthy tests (see-it-fail, snapshot/golden discipline, CI-only and heavy-browser tests, coverage gating).
- [general/agenticBestPractices.md](general/agenticBestPractices.md) — durable, project-agnostic practices for building and running AI agents.
- [general/git-and-github.md](general/git-and-github.md) — portable git & GitHub procedures (task lifecycle, commit history, CI-trigger rules, merge gotchas).
- [general/working-discipline.md](general/working-discipline.md) — general working habits (confirm-before-building, the warnings policy).
- [general/agent-architecture.md](general/agent-architecture.md) — structural rules for unattended, automation-invoked agents.

### preferences/ — per-user interaction preferences

- [preferences/missingbulb.md](preferences/missingbulb.md) — the repo owner's personal interaction preferences and trigger phrases.

### technologies/ — per-technology practices

- [technologies/nodejs.md](technologies/nodejs.md) · [technologies/chrome-extension.md](technologies/chrome-extension.md) · [technologies/flutter.md](technologies/flutter.md) · [technologies/html.md](technologies/html.md)

---

## How consuming repos join

Two ways to mount Claudinite (at `.claudinite/`) — pick by where your sessions
run:

- **Submodule** — pinned and reproducible. Use for local checkouts, CI, or any
  git client whose credential spans more than one repo.
- **Session-start tarball sync** — auto-updating, no git credential needed. Use
  for **Claude Code on the web**, where the credential is scoped to the session's
  own repo and a submodule clone of this repo 403s at the proxy.

Either way, the corpus is imported with `@.claudinite/README.md` in the
consumer's `CLAUDE.md` — that single `@`-import pulls in **this index only**, and
this index then softly routes to the rest (above). **Setup steps for both →
[bootstrap.md](bootstrap.md).**

## Repository operations

Beyond the portable corpus above, `routines/` holds the specs for this repo's own
maintenance routines — Claudinite-internal operations that are **not** part of
the mounted corpus and are not imported by consumers:

- [routines/claudinite-lesson-curation.md](routines/claudinite-lesson-curation.md) — curates inbound `claudinite-lesson` proposal issues into reviewed docs PRs against the corpus.
- [routines/auto-branch-report.md](routines/auto-branch-report.md) — project-agnostic nightly open-branch status report any consuming repo can vendor and run.

## Submodule caveats (for consumers)

These apply only if you mount via the **submodule** method; the tarball sync
sidesteps them (at the cost of pinning):

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning.
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
