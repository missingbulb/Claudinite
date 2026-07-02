# Growth phase 2 — promote lessons into the canon (central)

Operational spec for the **central** routine that lifts portable lessons out of every consuming project's local docs and folds them into Claudinite's shared **corpus** — the `*.md` rule files under `always/` (the always-on baseline), `tasks/` (on-demand practices), `preferences/` (per-user), and `technologies/` (per-technology) that consuming repos mount read-only. It is phase 2 of the [growth lifecycle](README.md): [extract](extract.md) captured project-specific lessons; this phase generalizes the portable ones up; [dedup](dedup.md) later prunes the local copies the canon now covers.

This runs **once, centrally, from the Claudinite home repo** — not per project. It is Claudinite-internal: consuming repos do **not** vendor or `@import` it. It replaces the old cross-repo handoff entirely (the labelled-issue path, the consumer-side Action, and the Claudinite-scoped PAT are gone): because this routine runs from the home repo with a **fleet-wide token**, it reads every project directly and writes the canon directly — there is no repo boundary to tunnel an issue across.

## Why this can be central (and the safety cost)

A session *inside* a consuming repo can't write to the read-only canon, which is why the up-path used to need an Action + PAT. This routine doesn't run inside a consumer — it runs from the home repo, reads each consumer's docs over the API, and pushes to the canon over the API. One routine, no plumbing.

The cost: promotion is now the **sole judgment gate before shared canon** — there is no human PR behind it (the owner opted the unattended routines into direct-to-main). Phase 1 deliberately stays project-specific, so it is **not** a second opinion on portability. That makes this routine's judgment the only thing standing between a bad rule and every project that reads the canon. Compensate the only way available: **run on a capable model, dedupe against the whole corpus, and default to reject when unsure** (below). A wrong acceptance here silently pollutes every consumer.

## Run on a capable model

Every step is a judgment call — portability, duplication, ownership, "does this clear the bar," how to generalize a project-specific lesson without distorting it. Per [agenticBestPractices.md](../tasks/agenticBestPractices.md) ("Match the agent model to the judgment it must make"), run this routine on a capable model. A downgraded model ships a plausible-but-wrong **acceptance** — exactly the failure that pollutes shared canon — where a capable model correctly rejects.

## What each run does

### 1. Enumerate the fleet and read every project's local docs

Enumerate every opted-in repo the token can access (the same discovery the fleet orchestrator uses — the tracked `.claudinite/` signal; see [routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)). For each, read its **local instruction docs** — identified the same way every phase identifies them: follow the pointer graph out from the repo's root `CLAUDE.md`, **minus** the mounted canon under `.claudinite/` (see [growth/README.md](README.md)). Here you're outside the repo, so walk that graph over the API (get-file-contents from `CLAUDE.md` outward, never a checkout — cross-repo clones aren't available in the sandboxed environment); the reachable non-canon docs are the set to read. The candidate pool is every distilled rule sitting in those local docs — both lessons [extract](extract.md) added this cycle and any portable local item never promoted before. You don't need to tell new from old: the dedup step below drops anything the canon already carries, so an already-promoted item simply falls out.

### 2. For each candidate, judge worthiness and generalize

Route each candidate through the corpus's shared method, kept once in [item-routing.md](item-routing.md) so every caller decides the same way — read it rather than re-deriving the gates here. A candidate earns a place in the canon only when it is **portable** (true for any consuming project read cold, not leaning on one project's files/services/mechanics), **durable and reusable**, and **not already covered** anywhere in the corpus. Most local items are *not* portable — that's expected; they stay local and this routine leaves them alone.

When a candidate is portable but phrased for its origin project, **generalize it**: strip the project-specific names and restate it as one tight, project-agnostic rule. The worked example stays in its origin repo — promote the distilled rule only, never paste in the origin project's files, issue numbers, or example.

### 3. Dedupe ruthlessly — against the *entire* corpus

Read **every corpus doc** before accepting anything, not just the doc you expect to own the item. The same insight is frequently already present under a different heading or in an adjacent group. **Default to reject when unsure.** Rejection is the common, expected, healthy outcome — most candidates don't clear the bar. Reject when the insight is already covered anywhere, isn't portable, or is below the bar (situational, a one-off, a restatement of a generic truism, already implied by an existing rule). If a candidate genuinely **sharpens** an existing rule, fold the improvement into that rule with a minimal edit rather than adding a redundant bullet — never weaken or restate what's there.

### 4. Route and write — directly to the canon's default branch

- **Route** each accepted lesson into its **one** owning doc using [item-routing.md](item-routing.md), matching that doc's existing voice and format (a bold-thesis bullet in `agenticBestPractices.md`; a dense imperative bullet in `engineeringPractices.md`; a `##` section in `git-and-github.md`; a per-technology file under `technologies/`; a `tasks/` file for a subject-gated practice; `always/` only for a rule that applies to essentially every task). Pick exactly one owner; never split or duplicate across docs.
- **Bounded write surface.** Each accepted lesson edits only its single owning doc. The **one** sanctioned way to add a corpus *file* is the new-doc path in [item-routing.md](item-routing.md) ("When nothing fits") — a worthy lesson no existing doc owns earns its own doc, and that PR-free change is bounded to the new doc plus its README-contents and any routing-table registration, nothing more. Don't "improve" unrelated rules while you're in there.
- **Commit straight to `main`.** Push the accepted edits directly to Claudinite's default branch — no PR. Keep commits terse; reference this routine's tracking issue (below).

### 5. Log the run to the tracker

Append a dated comment to the standing tracking issue for every run that promoted at least one lesson, and for any notable rejection. See [Tracking issue](#tracking-issue).

## Tracking issue

The routine's standing self-improvement log is the issue titled exactly:

> **Auto-Improvements Tracker - Growth: Promote to Canon**

- **Find it by title, never by a hard-coded number** (a bare number can dangle).
- **Open it if missing; reopen it if it was closed** while runs still need logging.
- Log each run as a **dated comment** — not a sub-issue — so history accumulates in one scrollable feed: the date, and per lesson the origin repo, the owning doc it landed in, and the generalized rule (or, for a notable rejection, the reason and the existing rule that already covers it).

## What this routine must never do

- **Never require the old handoff plumbing** — no labelled issues, no consumer-side Action, no Claudinite-scoped PAT; it reads projects and writes the canon directly over the fleet-wide token.
- **Never promote a non-portable item** — a lesson that only makes sense with one project's context stays in that project's local docs.
- **Never accept on a tie** — default to reject when unsure; a wrong acceptance pollutes every consumer with no PR to catch it.
- **Never weaken, restate, or duplicate an existing rule** — fold a genuine sharpening into the existing rule, otherwise add one terse bullet.
- **Never edit anything outside the one owning doc** per accepted lesson — the sole exception is the bounded new-doc path in [item-routing.md](item-routing.md). Never alter the origin project.
- **Never inline this spec into the launcher** — the launcher stays a thin pointer here.
