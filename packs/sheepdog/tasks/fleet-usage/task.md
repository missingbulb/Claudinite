# Fleet usage — recompute the fleet-wide skill-usage aggregate

**This task runs no agent.** It is `agent_model: none` with `code-work: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the executor runs as code-work, which calls its sibling in this folder, the sweep ([`aggregate-fleet-usage.mjs`](aggregate-fleet-usage.mjs)). This file is the human-facing record of what that worker does; there is no agent phase.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (sheepdog) repo's `sheepdog` pack entry `config`, enumerate every repo that owner owns, read each covered member's `.claudinite/local/usage.GENERATED.json` at its default branch, and rebuild `usage-fleet.GENERATED.json` in this repo on a PR that lands itself where this repo's delivery settings allow (the shared landing helper, `engine/scheduler/land-pr.mjs`).

A **stateless full recompute** — the file is a pure function of the members' current files. Idempotent by definition, self-healing after any past error, and cheap to no-op: a fleet whose numbers did not move produces the same file and opens no PR.

## What it answers that a member cannot

Each member folds its own numbers, so each can say whether a skill ever loads *there*. Whether a skill earns its place at all is a fleet-shaped question: never loading in one repo may only mean it isn't that repo's subject, while never loading in **any** of them means the trigger is mis-described — or that the content should never have been gated behind a skill in the first place. Only a view across every member separates those.

The **conformance checks** are carried at the same grain and for exactly the same reason, and they answer a sharper question, because a check failure is an observed correction rather than an inferred one: the finding went back into the session and the agent fixed it before the work left the branch. A rule with steady failures across the fleet is a guard earning its keep; a rule that has never fired in *any* member is unreachable or describing something that does not happen; a rule firing on nearly every run is a default the corpus should change rather than a violation worth blocking on. The `errors` counter reads differently from all three — enforcement was silently off — and is the one number here whose right value is zero.

The grain is therefore full — week × repo × skill, and week × repo × rule, for history, plus each member's current day window verbatim — with nothing pre-summed. Every coarser view stays derivable from the file; a summary that threw the grain away would not.

A member still on an older fold carries no `checks` key. It lands as an empty check row, never as an exception: the sweep leads the members' upgrades, so that is the normal state for a while.

## Coverage gaps are reported, not skipped

A covered member with no usage file (not folding yet), or one whose file cannot be read, is listed in `coverage.absent` with the reason — census-style. A denominator with an invisible hole in it is worse than no denominator at all.

The `coverage` section accounts for the **whole fleet**, not just the members: uncovered repos land under `coverage.uncovered` and archived/fork/excluded ones under `coverage.outOfScope` (reason inline), neither contributing to any number. The worker also emits a run summary on **every** run — even one that opens no PR — naming every repo under its state, and flagging the folding members with no captured activity that day (*inactive today*). That daily fact lives in the run report, not the file: it moves with the date alone, and the file's unchanged-compare deliberately ignores the day stamp so an unmoved fleet opens no PR.

## A dormant member leaves the denominator

A member that declares `"dormant": true` ([the scheduler's gate](../../../claudinite-growth/scheduled-tasks.md)) is dropped from every rate and listed under `coverage.dormant` — distinct from `coverage.absent`, because "not in the race" and "should be folding and isn't" are different facts. Averaging a deliberately silent repo in would drag every fleet-wide number toward zero as the fleet accumulates finished projects. The test is `isDormant`, re-exported from the engine, so the sweep and the member's own scheduler cannot disagree.

## It is a sample, not a census

The file carries a `_note` saying so. Its whole population is *captured* sessions: sessions that merged, plus sessions that ended cleanly enough for the SessionEnd capture to fire. A session whose container was reclaimed, or that crashed, is invisible to every number in it.

The check counts sit inside a narrower boundary still, and the note says that too: they are what a *session* saw. A CI run counts when the session pulled its job log in — which is what "the agent was in the loop on it" means, and it is the loop that produces the correction — while a nightly or post-merge run nobody looked at does not, because nothing was corrected. CI can only see a run that *printed* something, so its share rides separately as `ciRuns`/`ciFailures` rather than skewing a rate. The under-count is one-directional — every check number is a floor on activations, never an over-count — which is what keeps "the checks caught N things fleet-wide this week" a claim worth making.

## Not a fleet mechanism

Its *implementation* reads every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.
