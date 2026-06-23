# Adopting Claudinite (bootstrap runbook)

The onboarding path a consuming repo runs **once**, right after deciding to adopt
Claudinite: go from "nothing here yet" to "shared rules mounted, imported, and
discoverable." It is written to be **read and executed by an agent**, not just by
a human — every step below is an instruction the agent carries out in the
consuming repo.

This file is Claudinite-internal: it is **not** part of the mounted corpus and
consumers do not `@import` it. It only ever runs from its canonical URL, because
a brand-new consumer has no Claudinite content on disk yet.

## How a consumer kicks this off

A consumer has nothing local to point at, so the entry point is a single prompt
carrying this doc's URL:

> Adopt Claudinite into this repo following
> https://github.com/missingbulb/Claudinite/blob/main/docs/adopting-claudinite.md

The agent fetches this doc and executes the runbook below. (Use the `main` URL —
the SHA-pinning discipline applies to the submodule pointer, **not** to these
onboarding instructions.)

Prefer not to hand it to an agent? The same steps run by hand are in
[Manual fallback](#manual-fallback).

## Runbook (what the executing agent does)

Run these in order, in the **consuming** repo. Make a reviewable diff and stop —
**do not commit or push**; the human owns the commit that introduces the
submodule pointer.

### 1. Confirm the mount path

Default to `docs/claude/shared/`. It's awkward to relocate later, so if the repo
has an established docs convention, confirm the path with the human before adding.

### 2. Add the submodule

```sh
git submodule add https://github.com/missingbulb/Claudinite.git docs/claude/shared
```

### 3. Ensure submodule init in the consumer's setup

Submodules aren't pulled automatically. Add `git submodule update --init
--recursive` to the consumer's setup script so fresh clones get the corpus, and
recommend `git clone --recurse-submodules` for first clones.

### 4. `@import` the corpus from `CLAUDE.md`

Append (creating `CLAUDE.md` if absent) imports of the corpus rule files by their
mounted relative path, e.g.:

```md
@docs/claude/shared/engineeringPractices.md
@docs/claude/shared/textAndFileManipulation.md
@docs/claude/shared/testingPractices.md
@docs/claude/shared/agenticBestPractices.md
@docs/claude/shared/git-and-github.md
@docs/claude/shared/working-discipline.md
@docs/claude/shared/agent-architecture.md
@docs/claude/shared/ownerPreferences.md
```

Read the submodule's `README.md` for the current file list rather than trusting
this snapshot — the corpus can grow. Keep project-*specific* rules in the
consumer's own docs, referencing these shared files by relative path; never copy
their content.

### 5. First-time adoption — document Claudinite in the host README

**Only when this is the first time Claudinite is added to this repo** (the host
`README.md` has no Claudinite reference yet), add a short section to the host
project's `README.md` telling future readers and contributors that shared Claude
rules are mounted here. Keep it brief — what it is, where it's mounted, and that
it's a git submodule:

```md
## Claude rules

This repo mounts [Claudinite](https://github.com/missingbulb/Claudinite) — a
shared, project-agnostic set of Claude instruction docs — as a git submodule at
`docs/claude/shared/`, imported from `CLAUDE.md`. Clone with
`git clone --recurse-submodules` (or run
`git submodule update --init --recursive` after cloning).
```

Skip this step on re-runs and on repos that already mention Claudinite — it is a
one-time documentation action, not something to duplicate.

### 6. Hand back a reviewable diff

Summarize what changed (`.gitmodules`, the submodule pointer, `CLAUDE.md`, setup
script, README) and stop for the human to review and commit.

## Keeping the pointer current

A consumer pins a specific Claudinite commit SHA, so updating the rules here does
**not** auto-update consumers — each bumps its own pointer when ready:

```sh
git -C docs/claude/shared fetch && git -C docs/claude/shared checkout <sha>
git add docs/claude/shared && git commit -m "Bump Claudinite to <sha>"
```

**Content first, pointer second.** Editing a rule's *content* is a commit/PR in
**Claudinite**, not in the consumer; the consumer PR only records the new pointer
SHA. Merge the content commit here **first**, then bump the consumer's pointer, or
the pointer dangles. See [contributing back](../README.md) for the lesson-handoff
and direct-PR paths.

## Manual fallback

The same steps without an agent:

```sh
# 1–2. add the submodule at the recommended mount path
git submodule add https://github.com/missingbulb/Claudinite.git docs/claude/shared

# 3. make fresh clones pull it (add to your setup script)
git submodule update --init --recursive

# 4. import the corpus from CLAUDE.md (one @import line per file under
#    docs/claude/shared/ — see that dir's README for the current list)

# 5. on first adoption, add a "Claude rules" section to your README

# 6. review and commit
```
