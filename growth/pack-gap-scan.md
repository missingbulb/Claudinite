# Growth — pack-gap scan (per project)

A growth-family scan that answers one question about the repo in front of it: **which technologies does
this project use that no Claudinite pack covers?** It makes that gap *visible* — it converges a
tracking issue — and does nothing else. It never edits the canon and never mints a pack; minting a
pack for a surfaced gap is [promote](promote.md)'s job.

It exists because coverage is otherwise measured per **repo** (does this repo mount Claudinite?) and
never per **technology** (does every technology this repo uses have a pack?). A technology no pack owns
— a new language, platform, or packaging/distribution target — is otherwise structurally invisible:
its lessons land only in the project's own local docs, no pack home is ever minted, and the next
project on the same stack re-derives from scratch. This scan is what makes that loss impossible to miss.

> This is an **unattended daily** routine, gated to the weekly full sweep (below). It writes only a
> tracking issue in the project's own repo — no code, no docs, no canon. Finding no gaps is a
> perfectly good, common outcome.

## Why a leading question, not a marker table

The scan deliberately does **not** carry a list of "known technology markers." Maintaining such a table
is a burden and its coverage is exactly as stale as its last edit — it would miss the technology nobody
thought to add, which is the one that matters. Instead the scan hands a **capable agent the repo's full
working tree and a leading question**, and trusts its judgment. The agent already reads manifests, build
files, CI, and packaging scripts fluently; asking it "what does this repo build on?" is more trustworthy
than any fixed list, and needs no maintenance.

## Conventions used in this doc

- **Default branch.** `main` stands for your repository's default branch — substitute whatever your
  repo uses.
- **GitHub API access.** Updating the tracking issue goes through your environment's GitHub API tooling
  — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often
  reaches only a git-over-HTTPS proxy with no GitHub API; there, use the MCP tools, never `gh` / `curl`.
- **The pack shelf.** The packs mounted at `.claudinite/packs/` — read it directly; every `packs/<name>/`
  is a pack, and a pack with only a stub `RULES.md` still *owns* its technology (see below).

## How it finds gaps

1. **Answer the leading question.** From the repo's actual working tree — dependency and build manifests,
   toolchain config, CI workflows, and any packaging/distribution scripts — enumerate every **technology,
   platform, language runtime, major framework, and packaging-or-distribution target** this repository
   really builds on or ships to. Judge from what's *there*, not from what a project like this usually
   uses: a `Package.swift` and a `create-dmg`/`hdiutil` step mean Swift and Mac DMG distribution; a
   `pyproject.toml` means Python; a build that produces a signed installer names that channel.
2. **Keep only the pack-worthy ones.** A gap is worth surfacing only for a technology substantial enough
   to earn its own pack — a language, a platform, a distribution channel, a major framework — not every
   transitive library. The test mirrors the corpus's portability bar: *would a future project on this
   same technology benefit from a shared pack?* Yes → pack-worthy; a one-off utility dependency → drop it.
3. **Subtract what a pack already covers.** For each pack-worthy technology, check the shelf
   (`.claudinite/packs/`). A technology is **covered** — not a gap — when any pack owns it, **including a
   stub pack** whose `RULES.md` has no rules yet (`android`, `ios`, `app-store-release`, …): a stub is
   already the home; its emptiness is promote's fill-in job, not a gap. What remains — pack-worthy and
   owned by no pack, stub included — is the gap set.

## Output: converge a pack-gap tracking issue

Surface the gap set the way the fleet census surfaces uncovered repos — a **single standing issue,
converged**, not a running log. Find it **by title, never by a hard-coded number** (a bare number can
dangle):

> **Pack gaps — technologies with no Claudinite pack**

- **Gaps found → open it if missing (reopen if closed), and make its body match the current gap set** —
  one line per uncovered technology, each naming the technology and the concrete evidence in this repo
  (the manifest, the build step). If the issue already lists exactly these, leave it untouched — converge
  to reality, don't append a duplicate.
- **No gaps → close it** if it's open (`completed`); every pack-worthy technology has a home. Nothing to
  open when it was never opened.

Keep each line terse: the technology, and where it shows up here. The issue is a to-mint list for a
human and for [promote](promote.md); it is not a discussion thread.

## Run on a capable model

Naming a repo's technologies is reliable, but two calls are judgment: whether a technology is *pack-worthy*
(vs. a transitive dependency), and whether the shelf *already covers* it (a stub counts). A downgraded
model over-flags — filing gaps for libraries, or for technologies a pack already owns — turning a signal
into noise, and there's no PR gate here to catch it. Run this scan on a capable model.

## Gate: the weekly full sweep

A repo's technology composition is slow-moving — it changes when a new platform or distribution target is
added, rarely day to day — so the scan runs on the **weekly full sweep**, not every day the project
changes. Weekly visibility of a newly-introduced technology is a vast improvement over never, at no daily
cost. See the task's gate ([../packs/grow_with_claudinite/run_daily/growth-pack-gap-scan.mjs](../packs/grow_with_claudinite/run_daily/growth-pack-gap-scan.mjs)).

## What this routine must never do

- **Never edit the canon or mint a pack.** This scan only makes a gap visible; turning a gap into a
  minted stub pack is [promote](promote.md)'s stub-minting floor, gated behind promote's PR — see
  [the generate-project-instructions skill](../skills/generate-project-instructions/SKILL.md) for the
  pack-writing mechanics it reuses.
- **Never flag a technology a pack already owns** — a stub pack counts as a home; its empty `RULES.md`
  is not a gap.
- **Never invent a technology the repo doesn't actually use** — judge from the working tree, not from
  what projects like this typically use. A hallucinated gap is worse than none, since it lands with no
  review gate.
- **Never file a gap for a transitive utility dependency** — only for a technology pack-worthy on its
  own.
