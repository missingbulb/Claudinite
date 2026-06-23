# Claudinite

Portable Claude instruction/rules shared across projects. These are the
**project-agnostic** maintainer guidelines — general engineering practices,
agentic best practices, portable git/GitHub procedures, working discipline, and
the owner's personal interaction preferences — maintained **once** here and
mounted into each consuming repo as a git submodule, so they don't have to be
copy-pasted per project.

A consuming repo mounts this as a submodule (at `.claudinite/`) and `@import`s it
from its `CLAUDE.md`. Project-*specific* rules stay in the consuming repo's own
docs and reference these by relative path.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

See [bootstrap.md](bootstrap.md) for the manual steps.

## Contents

- [engineeringPractices.md](engineeringPractices.md) — general software-engineering practices, independent of any one project.
- [textAndFileManipulation.md](textAndFileManipulation.md) — mechanics of searching, extracting, and rewriting text across files (grep/sed sweeps, renames, broken references).
- [testingPractices.md](testingPractices.md) — practices for writing trustworthy tests (see-it-fail, snapshot/golden discipline, CI-only and heavy-browser tests, coverage gating).
- [agenticBestPractices.md](agenticBestPractices.md) — durable, project-agnostic practices for building and running AI agents.
- [git-and-github.md](git-and-github.md) — portable git & GitHub procedures (task lifecycle, commit history, CI-trigger rules, merge gotchas).
- [working-discipline.md](working-discipline.md) — general working habits (confirm-before-building, the warnings policy).
- [agent-architecture.md](agent-architecture.md) — structural rules for unattended, automation-invoked agents.
- [ownerPreferences.md](ownerPreferences.md) — the repo owner's personal interaction preferences and trigger phrases.

## Repository operations

Beyond the portable corpus above, `routines/` holds the specs for this
repo's own maintenance routines — Claudinite-internal operations that are **not**
part of the mounted corpus and are not `@import`ed by consumers:

- [routines/claudinite-lesson-curation.md](routines/claudinite-lesson-curation.md) — curates inbound `claudinite-lesson` proposal issues into reviewed docs PRs against the corpus.

## A submodule's caveats (for consumers)

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning (the consuming repo's setup script should do this).
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
