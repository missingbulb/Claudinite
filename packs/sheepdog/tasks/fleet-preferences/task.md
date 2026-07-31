# Fleet preferences — does every member know where this fleet's users' preferences live?

**This task runs no agent.** It is `agent_model: none` with `agent_preprocessing: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the scheduler runs as a subprocess, which calls its sibling in this folder, the sweep ([`check-fleet-preferences.mjs`](check-fleet-preferences.mjs)). This file is the human-facing record of what that worker does; there is no dispatch issue and no subagent.

## Why it exists

Personal preferences — how a person wants to be worked with — belong to a **fleet's users**. They are not a project's content, and they are not the **canon's**: the canon is mounted by every fleet that adopts Claudinite, so it is both the wrong host for one owner's preferences and the wrong authority on where they live.

So a project carries a **pointer** in its own settings, and the session-start step ([`inject-preferences.mjs`](../../../../engine/hooks/steps/inject-preferences.mjs)) reads `<repo>/<path>/<email>.md` from it:

```json
"preferences": { "repo": "missingbulb/Sheepdog" }
```

Nothing in the canon can populate that pointer. A bootstrap run from canon does not know **which fleet** it is bootstrapping into, and hardcoding one fleet's repo in shared code is the coupling this shape exists to remove. The enforcer knows exactly — it *is* the fleet — so the pointer is written from here.

## What it does

Daily, over the `FLEET_GITHUB_TOKEN` PAT: read this (sheepdog) repo's `sheepdog` pack entry `config` (`owner`, `exclude`, `preferencesRepo` — which defaults to **this repo**), enumerate every repo that owner owns, and for each **covered** member read its `.claudinite-checks.json` and its own vendored engine. Then:

| state | what happens |
|---|---|
| `set` | already points at the fleet's preferences repo — read and left alone |
| `writable` | no pointer (or one that doesn't resolve) and its engine accepts the setting → **one commit**, adding the key |
| `engine-behind` | its vendored engine predates the `preferences` setting → **waits**, no write |
| `elsewhere` | points at a **different** repo → reported, never overwritten |
| dormant / uncovered / archived / excluded / fork | out of the sweep (see below) |

It publishes the picture to the run summary. There is **no issue** in either direction: the finding *is* the fix, and it is applied.

## The one sweep in this pack that writes

The [census](../fleet-census/task.md) and the [freshness sweep](../fleet-freshness/task.md) report a condition and converge an issue for a human. This one lands a single additive settings key that carries **no human decision** — the fleet's preferences home is a fact this repo holds — so an issue asking someone to copy it into every member would be ceremony around a mechanical edit.

The write is **one PUT to the member's default branch**, guarded by the blob sha the read returned (the file moving under the run is a 409, which fails that member and is retried next run). It deliberately does *not* use the maintenance-branch lane that carries migrations ([`migrations/fleet-apply.mjs`](../../../../migrations/fleet-apply.mjs)): there is no code in it, nothing to review, and it is idempotent. It does **reformat** the declaration it edits to canonical 2-space JSON — the shape `--init` writes — because it round-trips the file through JSON instead of editing settings as text.

`expected_outcome: none` is therefore not a contradiction: the ceiling describes what a task may do to **its own** repo, and this task opens no PR here at all.

## The one-time backfill is not this sweep's job

The fleet that existed when the setting landed was carried by a **baseline migration**
([`migrations/active_migrations/2026-07-29-preferences-home.mjs`](../../../../migrations/active_migrations/2026-07-29-preferences-home.mjs)),
whose `settings` op declares the key on each member's next baselining — in the *same* transactional commit that vendors the engine which accepts it. That is strictly better than an outside write for the members that already exist: no ordering window, and no token that can write to other repos.

What the migration cannot be is **standing**. It is a dated record that retires, and its value is a literal in shared canon — which is exactly why it is allowed to name one fleet's repo (the same exemption the barriers rule grants migrations: naming the specific thing is a one-off record's purpose). This sweep is the durable half: it reads the home from *this repo's* config, so it serves any fleet, and it keeps working for members adopted long after the record is gone.

## The engine gate — why the rollout needs one

A top-level settings key the engine does not know is a **blocking `config` error** (an unknown setting is as much an error as invalid JSON). A member runs whatever engine version its vendored mount carries, so writing the pointer into a member whose mount predates the `preferences` key would break that repo's checks until its next baselining.

The sweep therefore reads the member's **own** engine (`.claudinite/shared/engine/checks/helpers/repo-context.mjs`, falling back to `engine/…` so the canon repo — which mounts nothing and runs its live tree — is swept by the same code path) and writes only when that file's `CONFIG_KEYS` names the setting. `engine-behind` is a **wait, not a finding**.

Reading the vocabulary itself rather than a version or a date is what makes the rollout need no coordination: members re-vendor nightly, and each is written the first run after its own mount learned the key.

## A dormant member is not written to

A member that declares `"dormant": true` ([the scheduler's gate](../../../basics/scheduled-tasks.md)) is skipped before anything else. It declared itself out of the recurring work, and a commit landed in it from the outside is exactly the upkeep it opted out of — its frozen mount would leave it at `engine-behind` indefinitely anyway. Its sessions fall back to default interaction behavior (the preferences step is fail-soft) until the repo wakes up, re-vendors, and is written then.

## A pointer someone else set is a decision

A member pointing at a **different** repo is reported and left alone. The fleet is the authority on which repo hosts its preferences, but a pointer set deliberately is a decision, and silently replacing it would be the sweep deciding something it cannot know.

## Not a fleet mechanism

Its *implementation* reads and writes every repo under the owner, but its declaration, scheduling and lifecycle are those of **any pack task**: it is active because this repo declares the `sheepdog` pack, and it runs on this repo's ordinary scheduler. It declares no `fleet` signal and no `fleet` session scope — the cross-repo reach lives in the implementation, never in the wiring.

## Failure is loud

A member whose declaration cannot be read, or whose pointer cannot be written (an unusable token, a protected default branch, a 409), is classified `unknown`: it is named in the summary and the sweep exits non-zero. The scheduler treats a non-zero preprocessing subprocess as a failed task and converges a `needs-human` issue, so a missing **Contents write** scope escalates rather than silently leaving members without their pointer.
