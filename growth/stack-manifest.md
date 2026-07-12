# Growth — stack manifest (per project)

**Stage 1 of pack discovery.** An agent inside the repo produces a comprehensive, evidence-grounded
**manifest** of what the project is built on and how it ships — its **technologies**, the **APIs and
external services** it integrates, and its **deployment and distribution** targets. It **decides
nothing**: whether any of this warrants a new Claudinite pack is a **separate, later, central** call
(stage 2), never this scan's job.

Keeping stage 1 pack-agnostic is the point. Conflating *"what does this repo use"* with *"should there
be a pack for it"* is the mistake this split exists to avoid: the first is a factual read of one repo,
the second is a canon-level judgment that only makes sense across the whole fleet (does the technology
*recur*? is a shared pack portable?). So this scan observes and catalogues; the decision reads the
catalogue later.

It exists because coverage is otherwise measured per **repo** (does this repo mount Claudinite?) and
never per **technology** (does every technology this repo uses have a pack?). A technology no pack owns
is otherwise structurally invisible. The manifest is the raw material that makes it visible — and the
input the pack-decision stage reads.

> This is an **unattended daily** routine, gated to the weekly full sweep (below). It writes only a
> converged tracking issue in the project's own repo — no code, no docs, no canon. It reads the repo
> and reports; it changes nothing about it.

## Stage 1 vs stage 2 — don't conflate

- **Stage 1 — this scan.** Observe and catalogue the repo's stack into a manifest. **Pack-agnostic**:
  it never reads the pack shelf, never asks whether an item deserves a pack, never recommends anything.
- **Stage 2 — separate, central, later.** Reads the fleet's manifests, weighs recurrence and
  portability, and decides whether to mint a pack — handing a real gap to [promote](promote.md)'s
  stub-minting floor, or converging a gap issue. Its mechanics are spec'd on their own; this scan only
  feeds it.

## Why a leading question, not a marker table

The scan deliberately carries **no** list of "known technology markers." Maintaining such a table is a
burden and its coverage is exactly as stale as its last edit — it would miss the technology nobody
thought to add, which is the one that matters. Instead it hands a **capable agent the repo's full
working tree and a leading question**, and trusts its judgment. The agent already reads manifests,
build files, CI, and packaging scripts fluently; asking it "what is this built on, and how does it
ship?" is more trustworthy than any fixed list, and needs no maintenance.

## Conventions used in this doc

- **Default branch.** `main` stands for your repository's default branch — substitute whatever your
  repo uses.
- **GitHub API access.** Updating the tracking issue goes through your environment's GitHub API tooling
  — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often
  reaches only a git-over-HTTPS proxy with no GitHub API; there, use the MCP tools, never `gh` / `curl`.

## The manifest the agent produces

Run the scan with this instruction, against the repo's actual working tree:

> Produce a **manifest** of what this project is built on and how it ships — a comprehensive,
> evidence-grounded inventory. You are **only** observing and cataloguing. You are **not** deciding
> anything about tooling, packs, standards, or what should change; you make no recommendations, and you
> do not compare this repo against anything outside it.
>
> **Ground every entry in the working tree.** Read dependency and build manifests, lockfiles, toolchain
> and config files, CI and release workflows, packaging and signing scripts, the source structure, and
> the docs. For each entry, cite the concrete evidence — the file (and the line/section or step) that
> proves it. Never infer from "projects like this usually…"; if the repo doesn't show it, it is not in
> the manifest. If something is present but appears vestigial or aspirational (declared but unused),
> include it and say so.
>
> Catalogue across **three axes**. Put each item under the single axis that fits best; when it genuinely
> spans two, place it under the primary and cross-note the other.
>
> 1. **Technologies** — languages and their versions, runtimes, frameworks, build systems, and the major
>    libraries that shape how you write and build here (the load-bearing ones, not every transitive
>    dependency). Evidence: manifests, lockfiles, toolchain/config.
> 2. **APIs & external services** — every third-party service, cloud API, SDK, auth provider, datastore,
>    message bus, or external integration the code actually talks to. Evidence: client SDK dependencies,
>    config/env keys, call sites.
> 3. **Deployments & distribution** — how and where this ships: packaging format(s), distribution
>    channel(s), the runtime/host it targets, signing/notarization, and the release mechanism. Evidence:
>    release workflows, packaging and signing scripts, deploy config.
>
> For **each** item report: **name**; **axis**; **evidence** (the file(s), and what they show); **what
> it is in this repo** (one line); **prominence** — one of `core` (the project is built on it),
> `supporting` (used but peripheral), `vestigial` (present but apparently unused); and a **`?` flag** if
> you are uncertain the item is real or correctly characterised. Prominence is a factual read of how
> central the item is *in this repo* — **not** a judgment about whether it deserves any downstream
> treatment; leave that to whoever consumes this manifest.
>
> Be **comprehensive over concise**: a later stage filters and decides, so a true item you omit is lost,
> while an over-included one is cheaply dropped later. When unsure whether something rises to an entry,
> include it with the `?` flag. Do **not** deduplicate against, reference, or even consider any pack,
> tool, or catalogue outside this repository.
>
> Output the manifest as Markdown grouped under the three axis headings, one bullet per item with the
> fields labelled.

## Output: converge a "Stack manifest" tracking issue

Publish the manifest as a **single standing issue, converged** — its body always reflects the current
manifest, not a running log. Find it **by title, never by a hard-coded number** (a bare number can
dangle):

> **Stack manifest — technologies, APIs, deployments**

Open it if missing (reopen if closed), and **make its body the current manifest**. If the manifest is
unchanged from what the issue already holds, leave it untouched — converge to reality, don't append a
duplicate. The issue is the artifact stage 2 reads; keep it exactly the manifest, nothing else.

## Run on a capable model

Producing a comprehensive, evidence-grounded manifest is bounded but wants care — completeness across
the three axes, and a real citation behind every entry. A downgraded model under-catalogues or invents
entries it can't ground, and there's no PR gate here to catch it. Run this scan on a capable model.

## Gate: the weekly full sweep

A repo's stack is slow-moving — it changes when a platform, integration, or distribution target is
added, rarely day to day — so the scan runs on the **weekly full sweep**, not every day the project
changes. Weekly visibility of a newly-introduced technology is a vast improvement over never, at no
daily cost. See the task's gate ([../packs/grow_with_claudinite/run_daily/growth-stack-manifest.mjs](../packs/grow_with_claudinite/run_daily/growth-stack-manifest.mjs)).

## What this routine must never do

- **Never decide whether anything deserves a pack, and never read the pack shelf** — that conflation is
  exactly what the stage-1/stage-2 split forbids. Deciding is stage 2's central job; this scan is
  pack-agnostic.
- **Never edit the canon, the project's docs, or its code** — it writes only its own tracking issue.
- **Never infer from "projects like this usually use…"** — ground every entry in this repo's working
  tree; a hallucinated entry lands with no review gate and misleads stage 2.
- **Never omit an item for brevity** — comprehensiveness is the point; stage 2 filters, so a missed
  item is lost while an over-included one is cheaply dropped.
