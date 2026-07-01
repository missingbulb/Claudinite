# Claudinite instruction-extraction routine (the pull-path)

Operational spec for the unattended, **Claudinite-initiated** routine that reaches *out* to every consuming repo, reads that repo's **project-specific instructions**, and up-levels the portable ones into this repo's shared **corpus** as a reviewed docs PR. It is the **pull-path mirror** of the consumer-initiated up-path: instead of waiting for a consumer to wire up the handoff Action and file a proposal, Claudinite proactively goes and finds the portable items itself. The two paths are complementary — this one catches consumers that never wired the up-path, or portable items a consumer's own routine hasn't promoted yet — and they **must not collide** (see [Dedupe](#3-dedupe-ruthlessly)).

This doc is the spec. The Claude Code launcher that runs the routine is a **thin pointer** to this file, never an inlined copy of it (see [agenticBestPractices.md](../tasks/agenticBestPractices.md) — "Keep an unattended routine's instructions in a repo doc, not inlined in the launcher's config"). Like the lesson-curation routine it is a concrete instance of the "daily lessons pass" and "standing tracking issue" rules in that same doc.

This file is Claudinite-internal operations: it is **not** part of the mounted corpus, and consuming repos do not `@import` it.

## The one hard constraint: changes land only in Claudinite

The routine reads every consumer **read-only** and produces its only writes here — a docs PR against this corpus, plus a dated comment on its own tracking issue. It **never** writes to a consumer: no issue, no comment, no edit, no PR, no removal of the local instruction it promoted. Reaching into a consumer is out of scope even to "tidy up" the item it just lifted.

**Removal of the promoted local copy is not this routine's job.** Promotion is a *proposal*; the corpus may reword or reject it. The local copy is pruned **later**, by the consumer's own [auto-optimize-procedures](../routines/auto-optimize-procedures.md) "Claudinite vs. local" pull-down (direction 1), on the day it sees the item actually land in the pinned canon. So a promoted-but-not-yet-accepted instruction keeps working locally in the meantime, and a rejected one simply stays local — exactly the up-path's "don't remove a just-promoted item" discipline, enforced here by the routine having no consumer write surface at all.

## How this relates to the consumer-initiated up-path

The [handoff up-path](../routines/claudinite-handoff.md) is *consumer-initiated*: a consumer's optimize-procedures routine files a `claudinite-lesson` issue, an Action copies it here, and [claudinite-lesson-curation](claudinite-lesson-curation.md) opens the docs PR. This routine is *Claudinite-initiated* and produces the **same kind of output** (a docs PR against the corpus) by the **same judgment** ([item-routing.md](item-routing.md)) — it just discovers the candidates by scanning rather than receiving them. Because both paths write docs PRs into this corpus, this routine's dedupe step ([§3](#3-dedupe-ruthlessly)) must clear each candidate against the corpus **and** against anything the other path already has in flight, so the same rule can't land twice.

## Discovery: live code-search for the mount marker

Each run **discovers the consumers at run time** — there is no maintained registry to drift. Every consumer mounts the corpus with the import line `@.claudinite/CLAUDE.md` in its own `CLAUDE.md` (both mount methods add it; the tarball method also commits a `.claudinite/.gitkeep` signal marker). GitHub-code-search for that marker across the repos your run can reach, and treat each hit as a consumer to scan.

- Use your environment's GitHub API tooling — the **GitHub MCP tools** or the `gh` CLI. In sandboxed/automation environments the shell often reaches only a git-over-HTTPS proxy with no GitHub API; there, use the MCP tools, never `gh` / `curl`.
- **Search scope is a real limit — surface it, never hide it.** Code search only returns repos the run's credential can see. If the run is scoped to fewer repos than the full consumer set, it silently scans a subset — so **log what you searched and how many consumers you found** (per [agenticBestPractices.md](../tasks/agenticBestPractices.md), a routine that bounds its coverage must say so; a silent cap reads as "scanned everything" when it didn't). Don't claim completeness you can't back.
- Skip this repo itself and any non-consumer hit (a doc that merely *mentions* the marker string, e.g. this spec or the bootstrap doc — match the actual import line / committed marker, not a passing reference).

## Run on a capable model

Every step below is a judgment call — is a local instruction actually **portable** or genuinely project-specific, is it **already covered** anywhere in the corpus, which doc **owns** it. Per [agenticBestPractices.md](../tasks/agenticBestPractices.md) ("Match the agent model to the judgment it must make"), run this routine on a capable model. A downgraded model promotes a project-specific instruction as if it were portable — polluting shared canon read read-only by every consumer — where a capable model correctly leaves it local.

## Trigger

Daily scan. One run sweeps all discovered consumers, collects every qualifying item across all of them, and opens **one** bundled docs PR (see [§4](#4-open-one-bundled-docs-pr)). Requires nothing pre-created; the routine is self-contained apart from its tracking issue, which it opens/reopens by title.

## What each run does

### 1. Read each consumer's *project-specific* instructions

For each discovered consumer, read its **own** instructions — its `CLAUDE.md` and the local docs that `CLAUDE.md` routes to — **read-only**. Read the consumer's project-specific layer, **not** the mounted corpus underneath it: everything under the consumer's `.claudinite/` is *already* canon (this very corpus), so it is never a candidate to "promote." The candidates are the instructions the project carries **outside** `.claudinite/` — its own rules, its working-set/shadow docs, its local conventions.

You are hunting for the specific case of a **portable rule currently living as a project-local instruction** — a general engineering/agentic/git practice, a working-discipline or agent-architecture principle, a portable technology practice — that *would help unseen projects* but today sits in one repo's local docs. A genuinely project-specific instruction (it leans on that repo's files, services, or mechanics) is **not** a candidate; it correctly stays local.

### 2. Distill and route each candidate — defer to `item-routing.md`

For each candidate, apply the corpus's shared [item-routing.md](item-routing.md) protocol — the same one the lesson-curation routine and every other caller use, kept in one place so every path decides identically. It owns both gates:

- **Worthiness** — distilled, portable, durable and reusable, not already covered. Default to reject; reject on a tie.
- **Routing** — the one owning doc (by group: practice `always/`+`tasks/`, per-user `preferences/`, per-technology `technologies/`), with the new-doc path when nothing genuinely fits.

Do not re-derive these here — read that doc and follow it. Distill the candidate into **one tight rule** in the imperative before judging it; an instruction still phrased for its home project ("in *this* repo, …") must be generalized first, and if it can't be generalized without leaning on that project, it isn't portable.

### 3. Dedupe ruthlessly

Read **every corpus doc** before accepting anything, not just the owning one — an insight is often already present under a different heading. On top of the corpus dedupe that [item-routing.md](item-routing.md) mandates, this routine has one extra source of collision to clear, because it shares the corpus with the consumer-initiated up-path:

- **Against in-flight up-path work.** Skip a candidate already represented by an open `claudinite-lesson` issue or an open curation docs PR — that item is already travelling up the other path; proposing it again would land the same rule twice.
- **Against this routine's own prior output.** Skip a candidate already covered by an open PR this routine opened on an earlier run.

The same rule surfacing from **several consumers at once** is the common case — collapse those into a single proposed rule, not one per consumer.

### 4. Open one bundled docs PR

Collect every accepted item across all consumers and open **one** PR against the corpus:

- **Route each item into its owning doc** as one terse rule in that doc's existing voice and format (a bold-thesis bullet in `agenticBestPractices.md`, a dense imperative bullet in `engineeringPractices.md`, a `##` section in `git-and-github.md`, etc.). Never weaken or restate an existing rule; if an item genuinely sharpens one, fold it in with a minimal edit rather than adding a near-duplicate bullet.
- **The worked example stays in the consumer.** Add only the distilled, portable rule — do not paste in a consumer's files, paths, issue numbers, or example. A freshly extracted rule carries no worked-example pointer unless one already lives in this corpus.
- **Bounded write surface.** Each item edits only its single owning doc. The **one** sanctioned way to add a corpus file is the new-corpus-doc path in [item-routing.md](item-routing.md) / [claudinite-lesson-curation.md §4c](claudinite-lesson-curation.md#4c-accept--create-a-new-corpus-doc-rare) — and even then the surface is exactly the new doc plus its README and routing-table registration, nothing more. Do not "improve" unrelated rules while you're in there.
- **PR, never a direct edit or merge.** Branch off the default branch with a per-run-unique branch name (append a random suffix so two same-day runs can't collide — see [git-and-github.md](../tasks/git-and-github.md)). Open the PR; **never merge** — a human reviews and merges. Bundling all items into one PR (rather than one per item) is the no-collision design: many same-doc edits land together instead of as rival PRs that conflict on merge.
- **Reference the source in the PR body for provenance** — name which consumer(s) each rule was extracted from — so a reviewer can trace it. This is a reference in *Claudinite's* PR; it is **not** a write to the consumer.

A run where nothing clears the bar opens **no PR** — the common, healthy outcome. Most days the portable items are already in the canon and nothing qualifies.

## Output & tracking

- Each qualifying run produces exactly **one PR** against the corpus. Never a merge, never a write to any consumer.
- Keep a **standing tracking issue** for this routine — found **by title, never a hard-coded number** (a bare number can dangle); open it if missing, **reopen it if it was closed** while runs still need logging. Suggested title: **Auto-Improvements Tracker - Claudinite Instruction Extraction**. It must **not** carry the `claudinite-lesson` label (it is not a proposal).
- Log each run that opened a PR as a **dated comment** on that issue — the date, the consumers scanned (and any search-scope limit from [Discovery](#discovery-live-code-search-for-the-mount-marker)), the items promoted, and the PR link. A quiet day (no PR) logs nothing.

## The launcher (Claude Code routine)

Keep the routine's config a **thin pointer** to this doc, not an inlined copy — inlined instructions drift against renamed paths and miss conventions the repo later adds. Schedule a daily routine (the Claude Code Routines UI, a cron, or a CI nightly trigger) whose prompt is roughly:

> Run the Claudinite instruction-extraction routine exactly as specified in `maintenance/claudinite-instruction-extraction.md`: code-search for the `@.claudinite/CLAUDE.md` mount marker to discover consuming repos, read each one's project-specific instructions **read-only**, and open **one** bundled docs PR against this corpus promoting only the genuinely portable items — routing and worthiness per `maintenance/item-routing.md`, deduped against the whole corpus and against any in-flight up-path issue/PR. Create changes **only in Claudinite**: never write to a consumer, and never remove the promoted local copy (the consumer's own optimize-procedures pull-down does that later). Never merge. Log any run that opened a PR to this routine's standing tracking issue (found **by title**), noting any search-scope limit.

The repo can't schedule itself, so this doc is the spec and the routine is the trigger.

## What this routine must never do

- **Never write to a consumer** — no issue, comment, edit, PR, or removal. Consumers are read-only; the only writes are the Claudinite docs PR and this routine's tracking-issue comment.
- **Never remove the promoted local instruction** — removal is the consumer's own "Claudinite vs. local" pull-down, later, once the canon absorbs it.
- **Never merge a PR, and never push a doc change directly to the default branch.**
- **Never promote a project-specific instruction as if it were portable, and never accept on a tie** — default to reject (per [item-routing.md](item-routing.md)).
- **Never let the same rule land twice** — dedupe against the corpus and against in-flight up-path work before proposing.
- **Never edit anything outside each item's one owning doc** — the sole exception is the bounded new-corpus-doc path.
- **Never claim full coverage you can't back** — log the search scope when it's narrower than the whole consumer set.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer here.
