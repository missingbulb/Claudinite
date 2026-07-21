// The run_daily PLANNER — pack-agnostic decision logic.
//
// It does exactly one thing: over the repos the maintenance routine hands it (this
// session's scoped repos), for each one collect the maintenance actions its declared
// packs contribute, run each action's "should I run" gate (pure code), and emit the
// day's work plan — a flat list of units the orchestrator dispatches. That is the
// whole planner: for each given repo → assemble its packs' run_daily tasks → run the
// gates → emit units. A repo with nothing to do yields no units.
//
// GitHub I/O is a single injected `gh(path) -> { status, json }` reader, supplied by
// the orchestrator ([routines/auto-all-repos-maintenance.md]) over its GitHub MCP
// tools. There is NO REST client here and no token: this module is pure decision
// logic + reads, exercised in tests against a fake `gh`. The orchestrator gathers the
// reads over MCP and runs this logic to obtain the plan — the "should I run" verdict
// is always code, never the orchestrator's judgment.

import { loadPacks } from '../../engine/packs/registry.mjs';
import { packTasks, assembleForRepo } from './registry.mjs';
import { buildSignals, computeCanonChange } from './signals.mjs';
import { planRepo } from './gates.mjs';
import { readLocalTasks } from './local-tasks.mjs';

// For each covered member: build its signal bundle, resolve its applicable tasks
// (its active packs' run_daily units), and run each gate. Every run:true verdict
// becomes a unit the orchestrator dispatches — the whole worklist decided in code
// here, before any worker agent runs. A member whose probe throws is isolated: it
// contributes no units and an error note, never sinking the plan.
//
// The canon repo is planned too — last, as an ordinary member of its own declared
// packs, with two extra signals no member gets: `isHome: true`, and `fleetMembers`,
// the aggregate of every successfully-probed member's { repo, activePacks,
// packConfigs, projectChanged, … }. That aggregate is what lets a home-only pack's gate decide
// fleet-facing work (e.g. "did any enrolled member change tonight?") in code,
// without the planner knowing any pack by name. Planning the canon repo last is what
// makes the aggregate complete when its gates run.
// `localTasksFor(repoInfo) -> Promise<task[]>` supplies each member's OWN
// local-pack run_daily tasks — the descriptors the canon checkout can't see,
// read from the member repo over `gh` and tagged with `pack`/`workerRepo`.
// The DEFAULT is the real reader (routines/fleet/local-tasks.mjs), so a
// declared local pack's daily tasks plan exactly like a canon pack's with no
// wiring — local-pack scheduling is on. The seam stays injectable: tests pass
// a fake, and an explicit `localTasksFor: null` disables local tasks. A member
// whose local-task read throws is isolated by the same per-repo try/catch as
// any other probe.
export async function buildWorkPlan(gh, canonRepo, coveredRepos, canonRepoInfo = null, { localTasksFor = (r) => readLocalTasks(gh, r.full_name) } = {}) {
  const sinceIso = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const weekdayUtc = new Date().getUTCDay();
  const canonChange = await computeCanonChange(gh, canonRepo, sinceIso);
  const canonPacks = await loadPacks();
  const allPackTasks = packTasks(canonPacks);
  // A local pack may not shadow a canon id — the engine drops such a pack and flags
  // a blocking config error, so mirror that here: never plan a local task whose pack
  // collides with a canon pack (readLocalTasks reads the member in isolation and
  // can't see the canon set, so the filter lives at the merge point).
  const canonIds = new Set(canonPacks.map((p) => p.id));
  const localFor = async (r) =>
    (localTasksFor ? (await localTasksFor(r)).filter((t) => !canonIds.has(t.pack)) : []);

  const units = []; const errors = []; const fleetMembers = [];
  for (const r of coveredRepos) {
    try {
      const signals = await buildSignals(gh, r, { sinceIso, weekdayUtc, canonChange });
      fleetMembers.push({ repo: r.full_name, activePacks: signals.activePacks, packConfigs: signals.packConfigs, projectChanged: signals.projectChanged, substantiveChange: signals.substantiveChange, hasLocalPacks: signals.hasLocalPacks, localPacksChanged: signals.localPacksChanged });
      const applicable = assembleForRepo(signals.activePacks, allPackTasks, await localFor(r));
      const res = await planRepo({ fullName: r.full_name, defaultBranch: r.default_branch }, signals, applicable, gh);
      units.push(...res.units); errors.push(...res.errors);
    } catch (e) {
      errors.push({ repo: r.full_name, error: e.message });
    }
  }
  if (canonRepoInfo) {
    try {
      const signals = {
        ...(await buildSignals(gh, canonRepoInfo, { sinceIso, weekdayUtc, canonChange })),
        isHome: true,
        fleetMembers,
      };
      const applicable = assembleForRepo(signals.activePacks, allPackTasks, await localFor(canonRepoInfo));
      const res = await planRepo({ fullName: canonRepoInfo.full_name, defaultBranch: canonRepoInfo.default_branch }, signals, applicable, gh);
      units.push(...res.units); errors.push(...res.errors);
    } catch (e) {
      errors.push({ repo: canonRepoInfo.full_name, error: e.message });
    }
  }
  return { generatedAt: new Date().toISOString(), windowStartUtc: sinceIso, weekdayUtc, canonChanged: canonChange.changed, units, errors };
}

// Fetch the details buildSignals needs (full_name, default_branch, pushed_at) for
// each repo the routine handed us, then plan over them. The canon repo, if present in
// the list, is planned LAST (as canonRepoInfo) so home-only packs' gates see the
// complete fleet aggregate. A repo that can't be read is skipped with a note — never
// fatal: one repo's error must not stop the plan for the rest. `gh` is the
// orchestrator's MCP-backed reader; the orchestrator names the canon repo (a known
// constant — the repo this canon ships from), so nothing here is discovered from a
// CI env var.
export async function planGivenRepos(gh, canonRepo, fullNames, opts = {}) {
  const repos = []; const unknown = []; let canonRepoInfo = null;
  for (const full of fullNames) {
    const { status, json } = await gh(`/repos/${full}`);
    if (status !== 200 || !json?.full_name) { unknown.push(`${full} (status ${status})`); continue; }
    if (canonRepo && full.toLowerCase() === canonRepo.toLowerCase()) { canonRepoInfo = json; continue; } // planned last, with the fleet aggregate
    repos.push(json);
  }
  const plan = await buildWorkPlan(gh, canonRepo, repos, canonRepoInfo, opts);
  return { plan, coveredCount: repos.length, unknown };
}
