# Fleet preferences — does every member know where this fleet's people keep their preferences?

**This task runs no agent.** It is `agent_model: none` with `prework: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the sweep ([`check-fleet-preferences.mjs`](check-fleet-preferences.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## Why it exists

Personal preferences — how a person wants to be worked with — belong to a **fleet's people**. They are not a project's content, and they are not the **canon's**: the canon is mounted by every fleet that adopts Claudinite, so it is both the wrong host for one group's preferences and the wrong authority on where they live.

So a project declares the pack that reads them, and names the **store** in that pack's own config:

```json
{ "id": "UserPreferencesStore", "config": { "repo": "missingbulb/Sheepdog" } }
```

The pack's `session-start.mjs` then reads `<store>/<path>/<email>.md` into every session. Nothing in the canon can supply that name: a bootstrap run from canon does not know **which fleet** it is bootstrapping into, and one fleet's repo hardcoded in shared code is the coupling this shape exists to remove. The enforcer knows exactly — it *is* the fleet — so the declaration is written from here.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (sheepdog) repo's `sheepdog` pack entry `config` (`owner`, `exclude`, `preferencesRepo` — which defaults to **this repo**), enumerate every repo that owner owns, and for each **covered** member read its `.claudinite-checks.json` and check whether the pack's code is on its disk. Then:

| state | what happens |
|---|---|
| `set` | already names the fleet's store — read and left alone |
| `writable` | no store (or a declared pack with none) and the pack's code is present → **one commit**, declaring it |
| `not-vendored` | its mount does not carry the pack yet → **waits**, no write |
| `elsewhere` | names a **different** store → reported, never overwritten |
| dormant / uncovered / archived / excluded / fork | reported under its own state, never written to |

Every repo under the owner lands in the summary under exactly one state. There is **no issue** in either direction: the finding *is* the fix, and it is applied.

## The one-time backfill is not this sweep's job

The fleet that existed when the pack landed was carried by a **baseline migration**
([`2026-08-07-user-preferences-store.mjs`](../../../../migrations/active_migrations/2026-08-07-user-preferences-store.mjs)),
whose `declarePacks` op seeds the pack on each member's next baselining — in the *same* transactional commit that vendors the pack's code, because baselining re-converges the mount whenever a note changed the declaration. That is strictly better than an outside write for the members that already exist: no ordering window, and no token that can write to other repos.

What the migration cannot be is **standing**. It is a dated record that retires, and its value is a literal in shared canon — which is exactly why it is allowed to name one fleet's repo (the same exemption the barriers rule grants migrations: naming the specific thing is a one-off record's purpose). This sweep is the durable half: it reads the store from *this repo's* config, so it serves any fleet, and it keeps working for members adopted long after the record is gone.

## The mount gate

A declared pack whose code is **not in the member's mount** is a blocking `config` error there ("declares unknown pack"), and a member's mount carries only what that member declared as of its last converge. So the sweep writes only where the pack is already on disk — `.claudinite/shared/packs/UserPreferencesStore/pack.mjs`, falling back to `packs/…` so the canon repo (which mounts nothing and runs its live tree) is swept by the same code path.

`not-vendored` is a **wait, not a finding**: members converge nightly, and each is written the first run after its own mount carries the pack.

## The write

One PUT to the member's default branch, guarded by the blob sha the read returned (the file moving under the run is a 409, which fails that member and is retried next run). It deliberately does *not* use the maintenance-branch lane that carries migrations ([`migrations/fleet-apply.mjs`](../../../../migrations/fleet-apply.mjs)): there is no code in it, nothing to review, and it is idempotent. It does **reformat** the declaration it edits to canonical 2-space JSON — the shape `--init` writes — because it round-trips the file through JSON instead of editing settings as text.

`expected_outcome: none` is therefore not a contradiction: the ceiling describes what a task may do to **its own** repo, and this task opens no PR here at all.

## A dormant member is not written to

The run covers every member, and a member that declares `"dormant": true` ([the scheduler's gate](../../../basics/scheduled-tasks.md)) is one the sweep writes nothing to — it is read, classified `dormant`, and named in the summary under that state. It declared itself out of the recurring work, and a commit landed in it from the outside is exactly the upkeep it opted out of; its frozen mount would leave it un-writable indefinitely anyway. Its sessions fall back to default interaction behavior (the pack's step is fail-soft) until the repo wakes up, converges, and is written then.

## A store someone else set is a decision

A member naming a **different** store is reported and left alone. The fleet is the authority on which repo hosts its preferences, but a store set deliberately is a decision, and silently replacing it would be the sweep deciding something it cannot know.

## Not a fleet mechanism

Its *implementation* reads and writes every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud

A member whose declaration cannot be read, or whose store cannot be written (an unusable token, a protected default branch, a 409), is classified `unknown`: it is named in the summary and the sweep exits non-zero. The scheduler treats a non-zero prework subprocess as a failed task and converges a `needs-human` issue, so a missing **Contents write** scope escalates rather than silently leaving members without their store.
