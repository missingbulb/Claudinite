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
   `discover.mjs` (task discovery, activation-gated), `signals/<name>.mjs`
   collectors (`commits`, `prs`, `issues`, `branches`, `release`, `localPacks`,
   `sharedMount`, `conversationLogs`, `fleet`), `dispatch.mjs` (issue
   search/create/label + at-most-one-open + stale escalation),
   `validate-dispatch.mjs`, `verify-outcome.mjs`, `model-map.mjs`,
   `executor.md`, and the workflow stub `stubs/claudinite-scheduler.yml`.
2. **Engine schema**: add `schedule` to `CONFIG_KEYS` with load-time validation
   (`dailyHour` 0–23, `weeklyDay` Sun–Sat, `monthlyDay` 1–31) and the documented
   defaults.
3. **Convert canon pack tasks**: each `packs/<p>/run_daily/<t>.mjs` +
   `<t>.worker.md` → `packs/<p>/tasks/<t>/{task.mjs,task.md}` with the new
   declaration fields per DESIGN.md §6 (grow_with_claudinite's root-level worker
   docs move into their task dirs). Gates become preconditions over the new
   signals object; `smarts` → `model`; `full_sweep_supported` dropped.
   `pack.mjs` `run_daily:` field → `tasks:` (directory listing stays the
   source of truth for the scheduler; the field remains for engine-side
   completeness checks).
4. **Checks**: new `task-declaration-shape` (every `tasks/*/task.mjs` exports the
   full contract with legal enum values) and `scheduler-workflow-shape` (the
   vendored workflow's cron/concurrency/dispatch shape); rescope
   `gha/no-scheduled-fleet-executor` (the vendored scheduler workflow is the one
   permitted engine-touching cron); scope `in-session-github-access` to exclude
   `engine/scheduler/` Action-side code; extend the routine-structure check to
   the task-folder convention.
5. **Docs**: rewrite `routines/fleet/scheduling.md` (new doctrine),
   `bootstrap.md` Part 6 (per DESIGN.md §9), unattended-agents SKILL.md
   (task-folder shape + issue-dispatch security rule), `packs/README.md`,
   `extending.md`, `routines/fleet/DESIGN.md` header pointing here.
6. **Transition guard** (small, ships first): the central planner skips members
   whose `.claudinite-checks.json` declares `schedule`, and the baselining
   worker's vendor set treats `tasks/` and `run_daily/` as aliases until
   Phase 4.
7. **Verify**: canon CI green; engine tests cover slot math (miss → catch-up,
   double-run → dedupe, first-run, month-clamp, hour-wrap), dispatch
   exactly-once + at-most-one-open, validate-dispatch accept/reject fixtures;
   one manual `workflow_dispatch` of the scheduler on the canon repo in dry-run
   mode prints a sane job summary.

## Phase 1 — pilot on GCEC

1. In-session vendor refresh of GCEC (brings the scheduler engine + converted
   canon packs); copy `claudinite-scheduler.yml` into `.github/workflows/`;
   create labels `ready-for-agent` / `agent-running` / `needs-human`
   (`workflow-failure` exists).
2. Move `dev/routines/create-extractor/` →
   `.claudinite/local_packs/gcec/tasks/create-extractor/` and
   `dev/routines/auto-fallback-coverage/` →
   `.claudinite/local_packs/gcec/tasks/auto-fallback-coverage/`
   (`routine.md` → `task.md`, scripts beside). Write the two `task.mjs`
   declarations (DESIGN.md §6). Port `2-triage.js`'s deterministic dispositions
   into the create-extractor precondition (deny/allow/duplicate close with the
   canned message in-scheduler; only new hosts dispatch). Update every reference:
   gcec `RULES.md`, `CLAUDE.md`, `dev/procedures/fileDescriptions.md`, the
   extension popup comment. Fold in the drift fixes: gcec README's missing
   add-live-case row; CLAUDE.md's stale "checks run in CI" claim.
3. Write `"schedule": { "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }`
   into GCEC's `.claudinite-checks.json` — this is the cutover marker: the
   central routine stops planning GCEC the same night.
4. Create the GCEC executor routine (hourly, `sonnet`, launcher prompt
   `Execute the Claudinite executor: .claudinite/shared/engine/scheduler/executor.md`,
   cron minute = scheduler minute + 10). **Disable — do not delete** — the two
   old GCEC CCR triggers ("GCEC - Auto Implement Extractor", "GCEC - Fallback
   Extractor Coverage Improvements").
5. **Soak ≈1 week, verify**: hourly summaries list evaluations with sane
   skip-reasons; one real `extractor-request` flows end-to-end (precondition
   context → dispatch issue → executor → review PR ≤ ~1¼h); one
   auto-fallback-coverage daily run fires on a meaningful-commit day and skips a
   quiet day; never more than one open dispatch issue per task; scheduler does
   not self-trigger on its own issues/commits; a deliberately mangled dispatch
   issue (bad first line) is rejected by `validate-dispatch` and converged to
   `needs-human`.
6. Rollback: disable the scheduler workflow, remove the `schedule` key,
   re-enable the old triggers.

## Phase 2 — canon repo cutover (fleet work becomes canon tasks)

1. Add the canon-side tasks (DESIGN.md §6 table 2) to the canon's local packs:
   `canon-curation/tasks/{growth-promote,prose-to-checks-sweep}/`, a new
   `fleet-ops` local pack with `tasks/{baselining,migrations-apply,migrations-retire,growth-discover-packs}/`
   (discover-packs moves from member-scheduled to one central weekly task); the
   census stays a sheepdog-repo task (`tasks/fleet-census/`, `model: none`).
2. Build the `fleet` signal collector over the fleet PAT (`FLEET_GITHUB_TOKEN`
   Actions secret in the canon repo — the census's existing credential);
   implement the `applied-<date>.json` artifact handoff between
   migrations-apply (`daily-2h`) and migrations-retire (`daily+1h`).
3. Canon repo: `schedule` key (dailyHour 4), scheduler workflow, executor
   routine, labels — same as any member. The central routine keeps running for
   **unmigrated consumers only** (the Phase 0.6 guard now also skips the canon's
   own pack tasks, which the canon scheduler owns).
4. **Verify**: one full night where extract (pilot repos, 02:00) → promote
   (03:00) → dedup (04:00) ran via the new path with correct slot ordering;
   migrations apply/retire complete one cycle through the artifact handoff;
   promote's `fleet` signal lists exactly the members whose local packs changed.

## Phase 3 — remaining consumers (owner-orchestrated, batched ~3 at a time)

Repos: EdFringeNow, gRatio, TLDR, HelloWorldFlutterApp, EdFringeAllocator,
CrosswordChat, Sheepdog, LaughCounter, ShoutsAndWhispers.

Per-repo checklist (self-contained; one session each):

1. In-session vendor refresh; copy the scheduler workflow; create the labels.
2. Convert any local-pack `run_daily/` → `tasks/` (most repos: none).
3. Write the `schedule` key (cutover marker).
4. Create the executor routine (hourly, sonnet, thin-pointer prompt, minute+10).
5. Verify: first scheduler summary sane; central routine's next night skips the
   repo; executor no-ops cleanly on an empty hour.

## Phase 4 — decommission & cleanup

1. Delete the "All Missing Bulb Repos - Daily Maintenance" CCR trigger; delete
   the two disabled GCEC triggers.
2. Remove `routines/auto-all-repos-maintenance.md` and `routines/fleet/`
   (planner, registry, local-tasks, schedule, gates, signals + tests); drop the
   Phase 0.6 transition guard and the `run_daily`/`tasks` alias.
3. Retire enrollment: close any open `Enroll … in Claudinite fleet maintenance`
   issues; remove baselining's enrollment-close step and Part 6 remnants.
4. Repo-wide sweep (text-sweep skill): `run_daily`, `fullSweep`,
   `full_sweep_supported`, `smarts`, `auto-all-repos-maintenance` — every
   surviving reference is either historical (this folder) or updated.
5. **Final review with the owner** (boxed): the end-state schedule inventory —
   per-repo scheduler workflows + executor routines, the canon task table,
   the chrome-extension-release cron — matches DESIGN.md §8 exactly.

## Independent fixes (not gated on any phase)

- `engine/pack_loader/inject-pack-prose.mjs` imports nonexistent `registry.mjs`
  (file is `pack-registry.mjs`) — pack-prose injection is silently broken
  fleet-wide; fix + regression test + vendor refresh. Ship immediately as its
  own PR.
- The auto-fallback-coverage weekly-cron/daily-spec mismatch is *fixed by*
  Phase 1; until then it stands — no interim change.

## Risks

| Risk | Mitigation |
|---|---|
| GitHub cron unreliability / :00 stampede | Repo-hashed minute; run-ledger catch-up makes any miss self-healing. |
| Trigger API unavailable at bootstrap/migration time | Enclosed-config owner issue fallback (DESIGN.md §9). |
| Double execution across scheduler/executor overlap | Workflow `concurrency`; state=all title dedupe; `ready-for-agent` → `agent-running` claim swap. |
| Issue overload | At-most-one open dispatch issue per task, by construction; hourly tasks never backfill. |
| Fleet reads of private members from Actions | The existing `FLEET_GITHUB_TOKEN` PAT, already provisioned for the census. |
| Model family drift | Single vendored `model-map.mjs`. |
| Stranded repos mid-rollout | The `schedule`-key guard gives every repo exactly one owner at all times; central machinery deleted only in Phase 4. |

Out of scope: the chrome-extension-release daily workflow (stays as-is);
Yestersummary (untouched).
