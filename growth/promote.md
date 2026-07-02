# Growth phase 2 — promote lessons into the canon (central)

Phase 2 of the [growth lifecycle](README.md), run **once, centrally, from the Claudinite home repo** — not per project: read every consuming project's local docs, lift the portable lessons into the shared canon, and commit them to the canon's default branch. It is Claudinite-internal — consuming repos don't vendor or `@import` it.

Promotion is the **sole judgment gate before shared canon**: it commits directly, with no human PR behind it, and phase 1 stays project-specific by design, so it's no second opinion on portability. This routine's judgment is the only thing between a bad rule and every project that reads the canon — so keep the bar high. The strictness below (dedupe against the whole corpus, default to reject when unsure) is what compensates for the missing PR.

## Run on a capable model

Every step is a judgment call — portability, duplication, ownership, "does this clear the bar," how to generalize a project-specific lesson without distorting it. Per [agenticBestPractices.md](../tasks/agenticBestPractices.md) ("Match the agent model to the judgment it must make"), run this routine on a capable model. A downgraded model ships a plausible-but-wrong **acceptance** — exactly the failure that pollutes shared canon — where a capable model correctly rejects.

## What each run does

### 1. Enumerate the fleet and read every project's local docs

Enumerate every opted-in repo the token can access (the same discovery the fleet orchestrator uses; see [routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)). For each, read its **local instruction docs** — the set identified in [growth/README.md](README.md). You're outside the repo here, so read them over the API (get-file-contents, never a checkout — cross-repo clones aren't available in the sandboxed environment). The candidate pool is every distilled rule sitting in those local docs — both lessons [extract](extract.md) added this cycle and any portable local item never promoted before. You don't need to tell new from old: the dedup step below drops anything the canon already carries, so an already-promoted item simply falls out.

### 2. Generalize each candidate — *before* judging whether it belongs

Generalize first, then decide worthiness — never the reverse. A rule phrased for its origin project can look non-portable, or unlike anything already in the canon, until you've lifted it; deciding fitness first would wrongly reject it. The act of generalizing is itself the portability probe — a rule that goes vacuous when lifted, or only makes sense with its project's context, isn't portable; leave it local.

- **Work the rule standalone.** Judge and rewrite it on its own merits, independent of the doc it came from and whatever that doc named things — origin naming and grouping carry no weight.
- **Strip the project.** Remove the origin's names, files, and example; the worked example stays in its origin repo. Promote the distilled rule only.
- **Re-test a technology mention.** If the rule names or is framed around a specific technology, decide whether it's *truly* tied to that technology or a broader practice that merely surfaced there — lift it to the broader scope when it fits.
- **Tool vs. process.** If the rule is about using a specific tool *and* about a process, make the call on which it really belongs to, and frame it for that home.

### 3. Then judge worthiness — deduped against the *entire* corpus

Only now, holding the generalized rule, decide if it earns a place. Apply the worthiness + routing method [item-routing.md](item-routing.md) owns — don't restate its gates here. Dedupe against **every** corpus doc, not just the one you'd expect to own it — the same insight is often already there under a different heading. Default to reject when unsure; rejection is the common, healthy outcome.

### 4. Route and write — directly to the canon's default branch

- **Route** each accepted rule to its **one** owning doc; [item-routing.md](item-routing.md) owns that placement call (which group, tech vs. practice, tool vs. process, or a new doc when nothing fits). Match the target doc's voice and format; pick exactly one owner, never split or duplicate.
- **Write it terse — when + what.** State the relevance (*when* it applies) and the rule (*what* to do); that's the body. Add a *why* only to flag severity, and keep it to a few words — don't explain the world.
- **Bounded write surface.** Edit only the one owning doc; don't "improve" unrelated rules while you're in there. Adding a new corpus file is the sole exception, via the new-doc path [item-routing.md](item-routing.md) owns, which bounds what that change may touch.
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

- **Never wait on an inbound issue or label** — this routine reads the projects directly; there's no handoff queue to consume.
- **Never promote a non-portable item** — a lesson that only makes sense with one project's context stays in that project's local docs.
- **Never accept on a tie** — default to reject when unsure; a wrong acceptance pollutes every consumer with no PR to catch it.
- **Never weaken, restate, or duplicate an existing rule** — fold a genuine sharpening in per [item-routing.md](item-routing.md) instead.
- **Never edit anything outside the one owning doc** per accepted lesson — the sole exception is the bounded new-doc path in [item-routing.md](item-routing.md). Never alter the origin project.
