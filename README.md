# Claudinite

Portable Claude instruction/rules shared across projects. These are the
**project-agnostic** maintainer guidelines — general engineering practices,
agentic best practices, portable git/GitHub procedures, working discipline, and
the owner's personal interaction preferences — maintained **once** here and
mounted into each consuming repo, so they don't have to be copy-pasted per
project.

Project-*specific* rules stay in the consuming repo's own docs and reference
these by relative path.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

## How consuming repos join

Two ways to mount Claudinite (at `.claudinite/`) — pick by where your sessions
run:

- **Submodule** — pinned and reproducible. Use for local checkouts, CI, or any
  git client whose credential spans more than one repo.
- **Session-start tarball sync** — auto-updating, no git credential needed. Use
  for **Claude Code on the web**, where the credential is scoped to the
  session's own repo and a submodule clone of this repo 403s at the proxy. A
  SessionStart hook fetches latest `main` over plain HTTPS
  (`codeload.github.com`, on the Trusted egress allowlist) into a gitignored
  `.claudinite/`. Tradeoff: freshness over pinning (set `CLAUDINITE_REF` to pin
  a tag/SHA).

Either way, the corpus is imported with `@.claudinite/README.md` in the
consumer's `CLAUDE.md`. **Setup steps for both → [bootstrap.md](bootstrap.md).**

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

## Submodule caveats (for consumers)

These apply only if you mount via the **submodule** method; the tarball sync
sidesteps them (at the cost of pinning):

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning (the consuming repo's setup script should do this).
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
