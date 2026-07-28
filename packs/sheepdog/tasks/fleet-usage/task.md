# Fleet usage — recompute the fleet-wide skill-usage aggregate

**This task runs no agent.** It is `agent_model: none` with `agent_preprocessing: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the sweep ([`aggregate-fleet-usage.mjs`](aggregate-fleet-usage.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (sheepdog) repo's `sheepdog` pack entry `config`, enumerate every repo that owner owns, read each covered member's `.claudinite/local/usage.GENERATED.json` at its default branch, and rebuild `usage-fleet.GENERATED.json` in this repo on an auto-merging PR.

A **stateless full recompute** — the file is a pure function of the members' current files. Idempotent by definition, self-healing after any past error, and cheap to no-op: a fleet whose numbers did not move produces the same file and opens no PR.

## What it answers that a member cannot

Each member folds its own numbers, so each can say whether a skill ever loads *there*. Whether a skill earns its place at all is a fleet-shaped question: never loading in one repo may only mean it isn't that repo's subject, while never loading in **any** of them means the trigger is mis-described — or that the content should never have been gated behind a skill in the first place. Only a view across every member separates those.

The grain is therefore full — week × repo × skill for history, plus each member's current day window verbatim — with nothing pre-summed. Every coarser view stays derivable from the file; a summary that threw the grain away would not.

## Coverage gaps are reported, not skipped

A covered member with no usage file (not folding yet), or one whose file cannot be read, is listed in `coverage.absent` with the reason — census-style. A denominator with an invisible hole in it is worse than no denominator at all.

## It is a sample, not a census

The file carries a `_note` saying so. Its whole population is *captured* sessions: sessions that merged, plus sessions that ended cleanly enough for the SessionEnd capture to fire. A session whose container was reclaimed, or that crashed, is invisible to every number in it.

## Not a fleet mechanism

Its *implementation* reads every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.
