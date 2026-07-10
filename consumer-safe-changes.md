# Making changes to Claudinite without hurting consumers

> **Status: provisional — beliefs, not law.** Every entry here says what we're *currently* doing
> and *why we think* it helps. When an entry blocks a better change, challenge the entry rather
> than contorting the change; being cited in this guide is not, by itself, a reason something
> must stay. We'll solidify entries once they've earned it.

Claudinite is mounted by every consuming repo, so a change here lands in many places, on those
repos' schedules, usually with no human watching. This guide collects what we currently believe
about making such changes safely. It is a maintainer document for sessions working *in* this
repo; it is not part of the mounted corpus.

## First, know which channel the change travels

We think the most useful first question is *how* a change reaches consumers, because each
channel has a different blast radius and a different rollback story:

- **Canon reusable workflows and composite actions** (`.github/workflows/`, `.github/actions/`)
  — consumers reference them `@main`, so a merge here reaches every consumer's **next run
  instantly**, unattended, with no pin to hide behind. This is the highest-blast-radius channel.
- **Checks and pack prose** (`packs/`) — executed/loaded from the mount; tarball-sync consumers
  pick them up at their next session start, submodule consumers at their next pointer bump. A
  wrong *blocking* check fails consumers' Stop hook and CI — visible and recoverable, but
  fleet-wide noise, so treat check changes as production changes.
- **Copied artifacts** (pack `stubs/`, seeded configs) — these do **not** propagate at all. Each
  consumer holds its own copy, which drifts silently unless a check enforces its shape. Changing
  the source file alone only affects repos bootstrapped *after* the change.
- **Bootstrap wiring** (the committed artifacts [bootstrap.md](bootstrap.md) seeds into each
  consumer: the tracked sync hook, `settings.json` hook registrations, gitignore rules, skill
  symlinks, the pack declaration) — propagates through the **nightly re-bootstrap**, which
  re-runs the idempotent bootstrap on every member and commits drift **directly to its default
  branch**, no PR. Fleet-wide but lagging one nightly; the rollback story is the same channel
  (fix the canon, the next nightly re-heals). The discipline: a change here is written as
  bootstrap steps that **converge from every layout in the wild** — fresh, current, legacy,
  half-migrated — not just from the latest.
- **Skills** (`skills/`) — surfaced on demand from the mount; same propagation as prose, but
  only sessions doing the matching activity ever read them.

## Migrating a copied artifact (stubs and the like)

Because copies won't move on their own, we currently migrate them through the conformance
checks, in one Claudinite-only change:

1. Change the source artifact in the pack (the stub under `packs/<pack>/stubs/`).
2. Make sure the pack's conformance check enforces the properties that changed, with a `fix`
   that says how to align (usually "re-copy the stub"). A consumer's own next session or CI run
   then raises a blocking finding and performs the migration in that repo — no per-repo PR from
   here.
3. Keep the pack's `detect` fingerprint **tolerant of the legacy shape** while copies migrate
   (e.g. a `LEGACY_*` list beside the current constant). Otherwise `pack-declaration` tells a
   not-yet-migrated repo to *drop* the pack while the conformance check tells it to *fix* the
   stub — and we've seen that contradictory findings are exactly what stalls an unattended
   session.

We don't yet have fleet-wide telemetry for "everyone has migrated", so dropping a legacy
tolerance later is a judgment call for now — a separate, deliberate change, not part of the
migration itself.

## Relocating wiring that consumers reference by path

What we learned moving the Method B sync hook from `.claude/hooks/` into `.claudinite/`
(#211/#213): the file is only half the change — every *reference* to its old path is itself a
consumer-held copy that won't move on its own, and each needs a channel.

- **Enumerate the reference holders before touching the file** — `settings.json` hook commands,
  other canon scripts, the fleet routine's discovery probe, docs — then grep for the old path
  afterward (the `repo-text-sweeps` skill owns the mechanics). Include state that lives
  **outside the repo entirely**: a web environment's pasted Setup script is snapshotted at
  environment build, where no check, sync, or re-bootstrap can ever reach it.
- **Never break the channel the migration itself travels through.** Fleet discovery finds
  members by the tracked `.claudinite/` signal; when the signal file itself relocated, the
  discovery probe had to accept both shapes. A probe that recognizes only the new shape doesn't
  make noise like a wrong check — it **silently and permanently orphans** every unmigrated repo,
  since discovery is what reaches them to migrate them. Same for the settings registration: a
  session between canon merge and nightly migration still runs the old wiring, so the old layout
  must keep working until the re-bootstrap lands.
- **References nothing can reach get tolerance in the artifact instead** — the relocated script
  tries the new layout first and falls back to the legacy path, and the existing SessionStart
  probe/halt-gate asks for the one human action (re-paste) when a stale out-of-repo copy finally
  misfires. Prefer a probe that *detects* staleness over hoping the stale copy keeps working.
- **A canon-owned file tracked in consumer git updates on the commit channel, not the sync
  channel.** The session sync preserves the consumer's tracked copy over the tarball's newer
  one — otherwise every canon edit dirties every consumer's working tree until the nightly
  commits it. Clean trees each session; the re-bootstrap's direct commit is the update path.
- **Verify by replaying the migration on a simulated legacy consumer** before merging: build the
  old layout in a scratch git repo, run the documented steps verbatim, and assert the tree is
  clean both right after the migration and after a subsequent real session sync. This is the
  wiring-channel analog of "verify against a real consumer before the nightly does".

## Normalize requirements to canonical form at the door

When a requirement arrives expressed in someone's local context — a schedule in a local
timezone, a path from one repo's layout, a phrasing tied to one project's vocabulary — we
currently translate it to its canonical form **once, on the way in**, and record only the
result. A "nightly at 3:30 my time" request lands in the canon as a fixed UTC cron, stated in
UTC and nothing else. The reasoning: the person who asked can carry the original framing;
consumers shouldn't inherit it, and the canon shouldn't have to re-explain a conversion (or its
edge cases, like DST) forever. If the origin matters for revisiting the decision, it belongs in
the issue/PR that made the change, not in the shipped artifact.

## Changing the canon workflows themselves

Since `@main` references make these instant and fleet-wide, we currently lean on:

- **Additive, backward-compatible edits** — a new input gets a default; an output nobody
  consumes yet is free; renames and removals get the two-phase treatment above.
- **Verify against a real consumer before the nightly does** — a manual `workflow_dispatch` on
  one consuming repo is cheap; the scheduled run exercising a bad merge in every repo at once is
  not. The failure reporter turning red runs into issues is the safety net, not the plan.
