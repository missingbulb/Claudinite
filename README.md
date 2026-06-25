# Claudinite

Portable Claude instructions/rules shared across projects — the
**project-agnostic** maintainer guidelines, maintained **once** here and mounted
into each consuming repo so they don't have to be copy-pasted per project.
Project-*specific* rules stay in the consuming repo's own docs.

**Just adding Claudinite?** Tell the agent on the consuming repo:

> Read https://github.com/missingbulb/Claudinite/blob/main/README.md and bootstrap it.

---

## For the reading agent: how to traverse this corpus

**The agent-facing index lives in [CLAUDE.md](CLAUDE.md), not here.** It is the
map of the corpus — the read order (general → preferences → technologies), the
per-directory contents, and the soft-pointer rule (follow links on demand, never
`@`-import them). Consumers mount it as `@.claudinite/CLAUDE.md`; an agent working
in this repo loads it as the repo's own `CLAUDE.md`. Start there.

---

## How consuming repos join

Two ways to mount Claudinite (at `.claudinite/`) — pick by where your sessions
run:

- **Submodule** — pinned and reproducible. Use for local checkouts, CI, or any
  git client whose credential spans more than one repo.
- **Session-start tarball sync** — auto-updating, no git credential needed. Use
  for **Claude Code on the web**, where the credential is scoped to the session's
  own repo and a submodule clone of this repo 403s at the proxy.

Either way, the corpus is imported with `@.claudinite/CLAUDE.md` in the
consumer's `CLAUDE.md` — that single `@`-import pulls in **the index only**
([CLAUDE.md](CLAUDE.md)), and that index then softly routes to the rest. **Setup
steps for both → [bootstrap.md](bootstrap.md).**

## Repository operations

Beyond the portable corpus above, `routines/` holds the specs for this repo's own
maintenance routines — Claudinite-internal operations that are **not** part of
the mounted corpus and are not imported by consumers:

- [routines/claudinite-lesson-curation.md](routines/claudinite-lesson-curation.md) — curates inbound `claudinite-lesson` proposal issues into reviewed docs PRs against the corpus.
- [routines/auto-branch-report.md](routines/auto-branch-report.md) — project-agnostic nightly open-branch status report any consuming repo can vendor and run.
- [maintenance/item-routing.md](maintenance/item-routing.md) — the shared method for evaluating whether a proposed item is worthy of the corpus and routing it to the right file group; the curation routine and other callers defer to it.

## Submodule caveats (for consumers)

These apply only if you mount via the **submodule** method; the tarball sync
sidesteps them (at the cost of pinning):

- Submodules aren't pulled automatically: clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` after cloning.
- A consumer pins a specific commit SHA, so updating these rules does **not** auto-update consumers — each bumps its own pointer.
- Editing a rule's *content* is a commit/PR **here**; the consumer PR only records the new pointer SHA. Push/merge the content commit here **first**, then bump the consumer's pointer, or the pointer dangles.
