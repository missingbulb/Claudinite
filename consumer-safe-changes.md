# Making changes to Claudinite without hurting consumers

> **Status: provisional — beliefs, not law.** Every entry here says what we're *currently* doing
> and *why we think* it helps. When an entry blocks a better change, challenge the entry rather
> than contorting the change; being cited in this guide is not, by itself, a reason something
> must stay. We'll solidify entries once they've earned it.

Claudinite is vendored into every consuming repo, so a change here lands in many places, on the
fleet's schedule, usually with no human watching. This guide collects what we currently believe
about making such changes safely. It is a maintainer document for sessions working *in* this
repo; it is not part of the vendored corpus.

## First, know which channel the change travels

Since the fleet moved to the tracked vendored mount (vendoring/DESIGN.md, phases 1–3 complete),
the channel model is small — nothing reaches a consumer instantly, and nothing arrives outside
its git history:

- **The vendored corpus** (`engine/`, `packs/` — checks, prose, bundled skills) — each member
  holds a tracked snapshot under `.claudinite/shared/`, converged **whole-set** to the canon
  head by the nightly refresh and stamped with its provenance. Propagation lags one nightly,
  lands as a reviewable commit on the member's dated `claudinite/maintenance-<date>-<seed>` PR (auto-merged on
  `auto-merge` delivery once the repo's checks pass, held for the owner on `review`), and the
  rollback story is the same channel: fix the canon, the next nightly re-heals. A wrong
  *blocking* check still fails every member's Stop hook — visible and recoverable, but
  fleet-wide noise, so treat check changes as production changes.
- **Migration notes** (`migrations/active_migrations/`) — the channel for anything convergence
  can't express: renames of consumer-held wiring, declaration rewrites, one-off agentic steps.
  Stamp-day-gated and idempotent; the note's `legacyPresent` telemetry says when the fleet has
  moved and (for `retire: 'auto'`) retires the record itself.
- **Copied artifacts** (pack `stubs/`, seeded configs) — these do **not** propagate at all. Each
  consumer holds its own copy, which drifts silently unless a check enforces its shape. Changing
  the source file alone only affects repos bootstrapped *after* the change.
- **Bootstrap wiring** (the committed artifacts [bootstrap.md](bootstrap.md) seeds:
  `settings.json` hook registrations, the two gitignore lines, the pack declaration) —
  propagates through the nightly baselining's idempotent backfills on the same maintenance PR.
  The discipline: a change here is written as steps that **converge from every layout in the
  wild**, not just from the latest.

Out-of-repo state remains the one channel git never reaches: a web environment's pasted Setup
script is snapshotted at environment build. A change that moves what the pasted script calls
needs the script's own probe to fail fast and a member issue asking for the one human action
(re-paste).

## Migrating a copied artifact (stubs and the like)

Because copies won't move on their own, we currently migrate them through the conformance
checks, in one Claudinite-only change:

1. Change the source artifact in the pack (the stub under `packs/<pack>/stubs/`).
2. Make sure the pack's conformance check enforces the properties that changed, with a `fix`
   that says how to align (usually "re-copy the stub"). A consumer's own next session then
   raises a blocking finding and performs the migration in that repo — no per-repo PR from
   here.
3. Keep the pack's `detect` fingerprint **tolerant of the legacy shape** while copies migrate
   (e.g. a `LEGACY_*` list beside the current constant), so a fresh `--init` still recognizes a
   not-yet-migrated repo and seeds the pack.

Fleet-wide "everyone has migrated" telemetry exists — declare the rename as a
[baseline migration](migrations/README.md), **in the same change that introduces the tolerance**: a
tolerance that lands without its record has no signal that will ever retire it. Any legacy shape a
tolerance keeps readable (an old path, a stub's old form, a legacy key *inside* a consumer's config
file) is trackable the same way, `legacyPresent` reading whatever expresses the old shape. The
fleet census probes every repo for the legacy shape and **auto-retires** the migration once none
remain. While a migration's tolerance still lives inline (readers not yet consulting its
`resolvePath`), keep it `retire:'manual'` and drop it deliberately.

## Relocating wiring that consumers reference by path

What we learned moving the sync hook between homes (#211/#213), and again retiring it (#385):
the file is only half the change — every *reference* to its old path is itself a consumer-held
copy that won't move on its own, and each needs a channel.

- **Enumerate the reference holders before touching the file** — `settings.json` hook commands,
  other canon scripts, the fleet routine's discovery probe, docs — then grep for the old path
  afterward (the text-sweep skill owns the mechanics). Include state that lives
  **outside the repo entirely**: a web environment's pasted Setup script is snapshotted at
  environment build, where no check or baselining can ever reach it.
- **Never break the channel the migration itself travels through.** Fleet discovery finds
  members by the tracked `.claudinite-checks.json`; a probe that recognizes only a new shape
  doesn't make noise like a wrong check — it **silently and permanently orphans** every
  unmigrated repo, since discovery is what reaches them to migrate them. Same for the settings
  registration: a session already running when the canon change lands still runs the old wiring,
  so the old entry point must keep working until the member's refresh lands (that's what the
  stable `engine/hooks/*-command` addresses are for — relocate what they call, not the
  addresses).
- **References nothing can reach get tolerance in the artifact instead** — prefer a probe that
  *detects* staleness (and asks for the one human action) over hoping the stale copy keeps
  working.

## A vendored file executes in the consumer's context

Canon files that ship into consumers — the whole vendor set (`engine/` and the declared packs) —
run at their *landed* path inside the consumer's repo, not in the canon checkout they were
written and tested in. Before changing one, audit every environment assumption against each
context it ships to: **git discovers `.git` by walking upward**, so introspection from a vendored
copy answers with the *consumer's* repo unless constrained to the expected toplevel (the
`--show-toplevel` guard in `vendoring/apply-vendor-set.mjs` — an unconstrained `rev-parse HEAD` nearly
stamped a consumer sha as canon provenance, #340); relative paths resolve against the vendored
location; network access and credentials present where the file was written may be absent where it
lands. The co-located header comment at the usage site carries each specific trap; this entry is
the class.

## Normalize requirements to canonical form at the door

When a requirement arrives expressed in someone's local context — a schedule in a local
timezone, a path from one repo's layout, a phrasing tied to one project's vocabulary — we
currently translate it to its canonical form **once, on the way in**, and record only the
result. A "nightly at 3:30 my time" request lands in the canon as a fixed UTC cron, stated in
UTC and nothing else. The reasoning: the person who asked can carry the original framing;
consumers shouldn't inherit it, and the canon shouldn't have to re-explain a conversion (or its
edge cases, like DST) forever. If the origin matters for revisiting the decision, it belongs in
the issue/PR that made the change, not in the shipped artifact.
