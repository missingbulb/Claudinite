# Claudinite

Portable Claude instruction/rules shared across projects. These are the
**project-agnostic** maintainer guidelines — general engineering practices,
agentic best practices, portable git/GitHub procedures, working discipline, and
the owner's personal interaction preferences — maintained **once** here and
mounted into each consuming repo as a git submodule, so they don't have to be
copy-pasted per project.

A consuming repo mounts this as a submodule (e.g. at `docs/claude/shared/`) and
`@import`s these files from its `CLAUDE.md`. Project-*specific* rules stay in the
consuming repo's own docs and reference these by relative path.

## Contents

- [engineeringPractices.md](engineeringPractices.md) — general software-engineering practices, independent of any one project.
- [agenticBestPractices.md](agenticBestPractices.md) — durable, project-agnostic practices for building and running AI agents.
- [git-and-github.md](git-and-github.md) — portable git & GitHub procedures (task lifecycle, commit history, CI-trigger rules, merge gotchas).
- [working-discipline.md](working-discipline.md) — general working habits (confirm-before-building, the warnings policy).
- [agent-architecture.md](agent-architecture.md) — structural rules for unattended, automation-invoked agents.
- [ownerPreferences.md](ownerPreferences.md) — the repo owner's personal interaction preferences and trigger phrases.

## A submodule's caveats (for consumers)

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning (the consuming repo's setup script should do this).
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
