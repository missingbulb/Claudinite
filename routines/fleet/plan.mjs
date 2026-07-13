#!/usr/bin/env node
// The core run_daily PLANNER — Claudinite CORE, pack-agnostic.
//
// It does exactly one thing: over the repos the maintenance routine hands it (this
// environment's repos), for each one collect the maintenance actions its declared
// packs contribute, run each action's "should I run" gate (pure code), and emit the
// day's work plan — a flat list of units the orchestrator dispatches. That is the
// whole planner: for each given repo → assemble its packs' run_daily tasks → run the
// gates → emit units. It does not enumerate repos or reach account-wide (that is the
// coverage census's separate job).
//
// It is INDEPENDENT of any single pack. In particular it does not run, dispatch,
// or depend on an enforcer pack's fleet-coverage census: that census is just one
// more run_daily task that shows up in the plan like any other, and a broken or
// undeployed enforcer repo is one isolated unit (a baselining fix), never a reason
// the plan can't be built. Owning "which repos run tonight" is the planner's job;
// auditing "are all the owner's repos covered" is the enforcer pack's census —
// two separate concerns that must not gate each other.
//
// Dependency-free (global fetch, Node 20+); read-only toward every repo.

import { writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh } from './fleet-api.mjs';
import { loadPacks } from '../../packs/registry.mjs';
import { packTasks, assembleForRepo } from './registry.mjs';
import { buildSignals, computeCanonChanged } from './signals.mjs';
import { planRepo } from './gates.mjs';

const PLAN_PATH = 'plan.json'; // cwd-relative; ephemeral, never committed

// For each covered member: build its signal bundle, resolve its applicable tasks
// (its active packs' run_daily units), and run each gate. Every run:true verdict
// becomes a unit the orchestrator dispatches — the whole worklist decided in code
// here, before any worker agent runs. A member whose probe throws is isolated: it
// contributes no units and an error note, never sinking the plan.
//
// The HOME repo is planned too — last, as an ordinary member of its own declared
// packs, with two extra signals no member gets: `isHome: true`, and `fleetMembers`,
// the aggregate of every successfully-probed member's { repo, activePacks,
// projectChanged }. That aggregate is what lets a home-declared pack's gate decide
// fleet-facing work (e.g. "did any enrolled member change tonight?") in code,
// without the planner knowing any pack by name. Planning home last is what makes
// the aggregate complete when its gates run.
export async function buildWorkPlan(gh, home, coveredRepos, homeRepo = null) {
  const sinceIso = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const weekdayUtc = new Date().getUTCDay();
  const canonChanged = await computeCanonChanged(gh, home, sinceIso);
  const allPackTasks = packTasks(await loadPacks());

  const units = []; const errors = []; const fleetMembers = [];
  for (const r of coveredRepos) {
    try {
      const signals = await buildSignals(gh, r, { sinceIso, weekdayUtc, canonChanged });
      fleetMembers.push({ repo: r.full_name, activePacks: signals.activePacks, projectChanged: signals.projectChanged });
      const applicable = assembleForRepo(signals.activePacks, allPackTasks);
      const res = await planRepo({ fullName: r.full_name, defaultBranch: r.default_branch }, signals, applicable, gh);
      units.push(...res.units); errors.push(...res.errors);
    } catch (e) {
      errors.push({ repo: r.full_name, error: e.message });
    }
  }
  if (homeRepo) {
    try {
      const signals = {
        ...(await buildSignals(gh, homeRepo, { sinceIso, weekdayUtc, canonChanged })),
        isHome: true,
        fleetMembers,
      };
      const applicable = assembleForRepo(signals.activePacks, allPackTasks);
      const res = await planRepo({ fullName: homeRepo.full_name, defaultBranch: homeRepo.default_branch }, signals, applicable, gh);
      units.push(...res.units); errors.push(...res.errors);
    } catch (e) {
      errors.push({ repo: homeRepo.full_name, error: e.message });
    }
  }
  return { generatedAt: new Date().toISOString(), windowStartUtc: sinceIso, weekdayUtc, canonChanged, units, errors };
}

// Fetch the details buildSignals needs (full_name, default_branch, pushed_at) for
// each repo the routine handed us, then plan over them. The home repo, if present in
// the list, is planned LAST (as homeRepo) so home-only packs' gates see the complete
// fleet aggregate — by virtue of being home, not via the coverage marker (the canon
// doesn't mount itself). A repo that can't be read is skipped with a note — never
// fatal: one repo's error must not stop the plan for the rest.
export async function planGivenRepos(gh, home, fullNames) {
  const repos = []; const unknown = []; let homeRepo = null;
  for (const full of fullNames) {
    const { status, json } = await gh(`/repos/${full}`);
    if (status !== 200 || !json?.full_name) { unknown.push(`${full} (status ${status})`); continue; }
    if (home && full.toLowerCase() === home.toLowerCase()) { homeRepo = json; continue; } // planned last, with the fleet aggregate
    repos.push(json);
  }
  const plan = await buildWorkPlan(gh, home, repos, homeRepo);
  return { plan, coveredCount: repos.length, unknown };
}

async function main() {
  // The routine (which knows this environment's repos) hands us the repos to plan
  // over as CLI args; we don't enumerate. Auth is the run's own token.
  const token = process.env.GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY || '';
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const gh = makeGh(token);
  const { plan, coveredCount, unknown } = await planGivenRepos(gh, home, process.argv.slice(2));
  writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

  const summary = [
    `# Work plan — ${coveredCount} repo(s)`,
    '',
    `**Units:** ${plan.units.length}${plan.canonChanged ? ' · canon changed' : ''}`
      + `${plan.errors.length ? ` · ${plan.errors.length} probe error(s)` : ''}`,
    unknown.length ? `**Unreadable (skipped):** ${unknown.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`planner failed: ${e.message}`); process.exit(1); });
}
