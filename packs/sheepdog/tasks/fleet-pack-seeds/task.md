# Fleet pack seeds — does every member declare what this fleet standardizes on?

**This task runs no agent.** It is `agent_model: none` with `prework: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the sweep ([`check-fleet-pack-seeds.mjs`](check-fleet-pack-seeds.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## Why it exists

Some packs need a parameter **no member can derive**, because the answer is a fact about the *fleet* rather than about that repo — where its people's files live, which repo holds something shared, what the group calls itself.

Canon cannot supply it: a bootstrap run does not know **which fleet** it is bootstrapping into, and one fleet's value hardcoded in shared code is exactly the coupling packs exist to prevent. The enforcer can — it *is* the fleet. So this repo's sheepdog entry lists what its members should declare:

```json
{ "id": "sheepdog", "config": { "packSeeds": [ { "id": "<a pack>", "config": { … } } ] } }
```

and the sweep converges that list across every member.

## It names no pack

Every id and every config comes from `packSeeds`. The task and its sweep carry the **mechanism** — "these declarations, in every member" — and the fleet supplies the content. A sweep that named a pack would make the enforcer a second place packs are known, and the next fleet would inherit a choice that was never theirs. A fleet with no `packSeeds` is an ordinary fleet: the sweep says so and stops before walking anything.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this repo's `sheepdog` entry config (`owner`, `exclude`, `packSeeds`), enumerate every repo that owner owns, and for each **covered** member read its `.claudinite-checks.json` and check whether each seeded pack's code is on its disk. Then, per seed:

| state | what happens |
|---|---|
| `set` | the member already declares that pack — read and left alone |
| `writable` | it does not (or declares it with no config) and the pack's code is present → **one commit** |
| `not-vendored` | its mount does not carry the pack yet → **waits**, no write |
| dormant / uncovered / archived / excluded / fork | reported under its own state, never written to |

Every repo under the owner lands in the summary under exactly one state. There is **no issue** in either direction: the finding *is* the fix, and it is applied.

## Seed, never override

A member that already declares the pack keeps its entry, and one that already carries a config for it keeps that config. Both are that repo's decisions, and the fleet's list is a **floor, not a ceiling** — the same contract the `declarePacks` migration op keeps, for the same reason.

## The mount gate

A declared pack whose code is **not in the member's mount** is a blocking `config` error there ("declares unknown pack"), and a member's mount carries only what that member declared as of its last converge. So a seed is written only where the pack's code is already on disk — `.claudinite/shared/packs/<id>/pack.mjs`, falling back to `packs/…` so the canon repo (which mounts nothing and runs its live tree) is swept by the same code path.

`not-vendored` is a **wait, not a finding**: members converge nightly, and each is written the first run after its own mount carries the pack. For a pack arriving with canon, the baseline migration that ships it declares it and re-converges the mount in one transactional commit, so most members never pass through this state at all.

## The write

One PUT to the member's default branch, guarded by the blob sha the read returned (the file moving under the run is a 409, which fails that member and is retried next run). It deliberately does *not* ride the maintenance-branch lane baselining delivers migrations on: there is no code in it, nothing to review, and it is idempotent. It does **reformat** the declaration it edits to canonical 2-space JSON — the shape `--init` writes — because it round-trips the file through JSON instead of editing settings as text.

`expected_outcome: none` is therefore not a contradiction: the ceiling describes what a task may do to **its own** repo, and this task opens no PR here at all.

## A dormant member is not written to

The run covers every member, and a member that declares `"dormant": true` ([the scheduler's gate](../../../basics/scheduled-tasks.md)) is one the sweep writes nothing to — it is read, classified `dormant`, and named in the summary under that state. It declared itself out of the recurring work, and a commit landed in it from the outside is exactly the upkeep it opted out of; its frozen mount would leave it un-writable indefinitely anyway.

## Not a fleet mechanism

Its *implementation* reads and writes every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud

A member whose declaration cannot be read, or written (an unusable token, a protected default branch, a 409), is classified `unknown`: it is named in the summary and the sweep exits non-zero. The scheduler treats a non-zero prework subprocess as a failed task and converges a `needs-human` issue, so a missing **Contents write** scope escalates rather than silently leaving members undeclared.
