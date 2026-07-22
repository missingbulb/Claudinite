# Per-project scheduling — project & migration plan

Refs #390. Executes [DESIGN.md](DESIGN.md). The owner orchestrates every phase in
sessions; this rollout deliberately does **not** use the regular maintenance
mechanism (no `migrations/active_migrations/` note, no nightly-driven
conversion) — the old machinery keeps running untouched until Phase 4 and is the
rollback at every step.

Ground rules for every phase:

- Pilot before fleet: nothing reaches a second repo until GCEC has soaked (the
  standing "pilot on one real consumer" rule).
- Never break the channel the migration travels through: the central routine and
  the vendor-refresh path stay functional until Phase 4 decommission.
- Cutover per repo is marked by the `schedule` key in `.claudinite-checks.json`:
  the central planner skips any member that declares it (guard added in
  Phase 0.6), so a repo is covered by exactly one mechanism at all times —
  no double runs during the staggered rollout.
- Each phase ends with its verification step green before the next starts.

---

## Phase 0 — canon groundwork (Claudinite PRs; no behavior change anywhere)

1. **Build `engine/scheduler/`** (vendored to consumers with the engine):
   `run.mjs` (entry), `slots.mjs` (due-slot math over the workflow-run ledger),
   `discover.mjs` (uniform `.claudinite/{shared,local}/packs/*/tasks/*` scan,
   activation-gated), `signals/<name>.mjs` collectors (`commits`, `prs`,
   `issues`, `branches`, `release`, `localPacks`, `sharedMount`,
   `conversationLogs`, `stamp`, `fleet`), `dispatch.mjs` (issue
   search/create/label + at-most-one-open + stale escalation),
   `validate-dispatch.mjs`, `verify-outcome.mjs`, `model-map.mjs`,
   `executor.md` (including the drain-other-ready-issues sweep), and the
   workflow stub `stubs/claudinite-scheduler.yml` (hashed cron minute in
   **:10–:50**, `concurrency`, thin shim calling the vendored engine).
2. **Engine schema & layout**: add `schedule` to `CONFIG_KEYS` with load-time
   validation (`dailyHour` 0–23, `weeklyDay` Sun–Sat, `monthlyDay` 1–31) and the
   documented defaults. Implement the `local_packs` → `local/packs` rename
   engine-side: `LOCAL_PACKS_SUBDIR` moves to `.claudinite/local/packs`,
   discovery scans **both roots** until Phase 4, canonical declaration token
   becomes `local/<id>` (legacy `local_packs/<id>` and bare ids accepted;
   baselining's normalization rewrites them). Rename the canon's own
   `.claudinite/local_packs/` in the same change.
3. **Convert canon pack tasks**: each `packs/<p>/run_daily/<t>.mjs` +
   `<t>.worker.md` → `packs/<p>/tasks/<t>/{task.mjs,task.md}` with the
   declarations per DESIGN.md §6 (grow_with_claudinite's root-level worker docs
   move into their task dirs). Gates become preconditions over the new signals
   object; `smarts` → `model`; `full_sweep_supported` dropped. Two conversions
   are structural, not mechanical:
   - **baselining** becomes the per-repo self-refresh task in basics
     (`daily-2h`): converge own mount from the in-session canon checkout, apply
     pending migration notes (the fleet apply pass folds in), advance the stamp;
     precondition on `stamp`/`sharedMount` with stamp-age fallback; skips
     naturally where no shared mount exists (the canon).
   - **store-release** gains its Stage 2: the inline worker dispatches the
     release workflow in daily mode and awaits it; the stub loses its
     `schedule:` cron (ships to consumers in their cutover, together with the
     check flip below).
4. **Checks**: new `task-declaration-shape` (every `tasks/*/task.mjs` exports the
   full contract with legal enum values) and `scheduler-workflow-shape` (cron
   minute :10–:50, concurrency, dispatch shape); rescope
   `gha/no-scheduled-fleet-executor` to "the vendored scheduler workflow is the
   repo's only permitted cron"; flip
   `chrome-extension-release/release-workflows.mjs` from requiring the contract
   cron to **forbidding any cron** (lands in a consumer's mount together with
   the de-cron'd stub — never before it); scope `in-session-github-access` to
   exclude `engine/scheduler/` Action-side code; extend the routine-structure
   check to the task-folder convention.
5. **Docs**: rewrite `routines/fleet/scheduling.md` (new doctrine),
   `bootstrap.md` Part 6 (per DESIGN.md §9), unattended-agents SKILL.md
   (task-folder shape + issue-dispatch security rule), `packs/README.md`,
   `extending.md` (`run_daily` → `tasks`, `local_packs` → `local/packs`),
   `routines/fleet/DESIGN.md` header pointing here, and the growth-stage docs'
   capture-surface definition + claudinite-isolation carve-outs for the new
   local-pack path. (The sheepdog census classification note landed with the
   design PR.)
6. **Transition guard** (small, ships first): the central planner skips members
   whose `.claudinite-checks.json` declares `schedule`, and treats `tasks/` /
   `run_daily/` and both local-pack roots as aliases until Phase 4.
7. **Verify**: canon CI green; engine tests cover slot math (miss → catch-up,
   double-run → dedupe, first-run, month-clamp, hour-wrap), dispatch
   exactly-once + at-most-one-open, validate-dispatch accept/reject fixtures,
   dual-root discovery; one manual `workflow_dispatch` of the scheduler on the
   canon repo in dry-run mode prints a sane job summary.

## Phase 1 — pilot on GCEC

1. In-session vendor refresh of GCEC (brings the scheduler engine + converted
   canon packs + flipped release check); copy `claudinite-scheduler.yml` into
   `.github/workflows/`; **strip the `schedule:` cron from the release
   workflow** in the same commit; create labels `ready-for-agent` /
   `agent-running` / `needs-human` (`workflow-failure` exists).
2. `git mv .claudinite/local_packs .claudinite/local/packs`; rewrite the
   declaration token to `local/gcec`; sweep references (text-sweep skill).
3. Move `dev/routines/create-extractor/` →
   `.claudinite/local/packs/gcec/tasks/create-extractor/` and
   `dev/routines/auto-fallback-coverage/` →
   `.claudinite/local/packs/gcec/tasks/auto-fallback-coverage/`
   (`routine.md` → `task.md`, scripts beside). Write the two `task.mjs`
   declarations (DESIGN.md §6). Port `2-triage.js`'s deterministic *decision*
   into the create-extractor precondition — deny/allow/duplicate closes with the
   canned message in-scheduler; **fetching and scaffolding stay in the task**.
   Update every reference: gcec `RULES.md`, `CLAUDE.md`,
   `dev/procedures/fileDescriptions.md`, the extension popup comment. Fold in
   the drift fixes: gcec README's missing add-live-case row; CLAUDE.md's stale
   "checks run in CI" claim.
4. Write `"schedule": { "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }`
   into GCEC's `.claudinite-checks.json` — the cutover marker: the central
   routine stops planning GCEC the same night (self-baselining takes over the
   refresh).
5. Create the GCEC executor routine — **label-wired**: fires on the
   `ready-for-agent` label event, `sonnet`, launcher prompt
   `Execute the Claudinite executor: .claudinite/shared/engine/scheduler/executor.md`,
   sources = GCEC + Claudinite (as the old triggers had). **Disable — do not
   delete** — the two old GCEC CCR triggers.
6. **Soak ≈1 week, verify**: hourly summaries list evaluations with sane
   skip-reasons; one real `extractor-request` flows end-to-end (precondition
   context → dispatch issue → label event → executor → review PR, in minutes);
   one auto-fallback-coverage daily run fires on a meaningful-commit day and
   skips a quiet day; one self-baselining run converges the mount and advances
   the stamp; the release task dispatches (or correctly skips) the de-cron'd
   release workflow; never more than one open dispatch issue per task; the
   scheduler does not self-trigger on its own issues/commits; a deliberately
   mangled dispatch issue (bad first line) is rejected by `validate-dispatch`
   and converged to `needs-human`.
7. Rollback: disable the scheduler workflow, remove the `schedule` key, restore
   the release cron, re-enable the old triggers.

## Phase 2 — canon repo cutover

1. Add the canon-side tasks (DESIGN.md §6 table 2) to
   `canon-curation/tasks/`: `growth-promote` (daily, `fleet`),
   `growth-discover-packs` (weekly, `fleet` — moves from member-scheduled to one
   central weekly sweep), `migrations-retire` (daily+1h, `none`, `fleet` —
   stamp + `legacyPresent` probe evidence; no artifact plumbing), and
   `prose-to-checks-sweep` (**daily**, canon-local, no fleet signal). The
   sheepdog repo gains `tasks/fleet-census/` (daily, `none`) with the
   classification note in the task file.
2. Build the `fleet` signal collector over the fleet PAT (`FLEET_GITHUB_TOKEN`
   Actions secret — the census's existing credential).
3. Canon repo: `schedule` key (dailyHour 4), scheduler workflow, label-wired
   executor routine, labels — same as any member. The central routine keeps
   running for **unmigrated consumers only** (the Phase 0.6 guard also skips the
   canon's own pack tasks, which the canon scheduler now owns).
4. **Verify**: one full night where baselining (02:00) → extract (pilot repos,
   03:00) → promote (canon, 04:00, picking up the night's merged extracts) →
   dedup (05:00) ran in order via the new path; migrations-retire evaluates the
   guard from stamps + probes
   and correctly retires nothing (or stages a real retirement PR); promote's
   `fleet` signal lists exactly the members whose local packs changed;
   prose-to-checks fires daily and no-ops cheaply on a quiet corpus.

## Phase 3 — remaining consumers (owner-orchestrated, batched ~3 at a time)

Repos: EdFringeNow, gRatio, TLDR, HelloWorldFlutterApp, EdFringeAllocator,
CrosswordChat, Sheepdog, LaughCounter, ShoutsAndWhispers.

Per-repo checklist (self-contained; one session each):

1. In-session vendor refresh; copy the scheduler workflow; create the labels;
   strip any release cron (chrome-extension repos).
2. `git mv .claudinite/local_packs .claudinite/local/packs` (where present) +
   token rewrite + reference sweep; convert any local `run_daily/` → `tasks/`
   (most repos: none).
3. Write the `schedule` key (cutover marker).
4. Create the label-wired executor routine (sonnet, thin-pointer prompt,
   sources = repo + Claudinite).
5. Verify: first scheduler summary sane; central routine's next night skips the
   repo; a hand-labeled test dispatch issue executes and closes.

## Phase 4 — decommission & cleanup

1. Delete the "All Missing Bulb Repos - Daily Maintenance" CCR trigger; delete
   the two disabled GCEC triggers.
2. Remove `routines/auto-all-repos-maintenance.md` and `routines/fleet/`
   (planner, registry, local-tasks, schedule, gates, signals + tests); drop the
   Phase 0.6 transition guard, the `run_daily`/`tasks` alias, and the
   `local_packs` dual-root scan.
3. Retire enrollment: close any open `Enroll … in Claudinite fleet maintenance`
   issues; remove baselining's enrollment-close step and Part 6 remnants.
4. Repo-wide sweep (text-sweep skill): `run_daily`, `local_packs`, `fullSweep`,
   `full_sweep_supported`, `smarts`, `auto-all-repos-maintenance` — every
   surviving reference is either historical (this folder) or updated.
5. **Final review with the owner** (boxed): the end-state schedule inventory —
   per-repo scheduler workflows (the only crons) + label-fired executor
   routines + the canon task table — matches DESIGN.md §8 exactly.

## Independent fixes (not gated on any phase)

- The auto-fallback-coverage weekly-cron/daily-spec mismatch is *fixed by*
  Phase 1; until then it stands — no interim change.

## Risks

| Risk | Mitigation |
|---|---|
| GitHub cron unreliability / :00 stampede | Repo-hashed minute in :10–:50; run-ledger catch-up makes any miss self-healing. |
| Trigger API unavailable at bootstrap/migration time | Enclosed-config owner issue fallback (DESIGN.md §9). |
| Missed / duplicate label events | Executor's drain-other-ready-issues sweep + scheduler stale-issue escalation; `ready-for-agent` → `agent-running` claim swap. |
| Issue overload | At-most-one open dispatch issue per task, by construction; hourly tasks never backfill. |
| Fleet reads of private members from Actions | The existing `FLEET_GITHUB_TOKEN` PAT, only on the canon/sheepdog repos; consumers never need it. |
| Model family drift | Single vendored `model-map.mjs`. |
| Check/stub ordering (release cron flip) | The forbidding check and the de-cron'd stub travel in the same per-repo cutover commit. |
| Stranded repos mid-rollout | The `schedule`-key guard gives every repo exactly one owner at all times; central machinery deleted only in Phase 4. |

Out of scope: Yestersummary (untouched).
