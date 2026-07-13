#!/usr/bin/env node
// The core run_daily PLANNER — Claudinite CORE, pack-agnostic.
//
// It does exactly one thing: go over the repos it can reach, and for each covered
// member collect the maintenance actions its declared packs contribute, run each
// action's "should I run" gate (pure code), and emit the day's work plan — a flat
// list of units the orchestrator dispatches. That is the whole planner: enumerate
// accessible repos → assemble each one's packs' run_daily tasks → run the gates →
// emit units.
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
import { makeGh, paged, isCovered } from './fleet-api.mjs';
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

// Enumerate the repos this token can reach, keep the covered members (skipping
// forks and archived repos), and plan over them. The home repo is planned too —
// not via the coverage marker (the canon doesn't mount itself) but by virtue of
// being home: its own .claudinite-checks.json declares its packs, and home-only
// packs (declared nowhere else) are how fleet-facing central work rides the
// ordinary planner instead of bespoke orchestrator steps. An unclassifiable repo
// is skipped with a note — never fatal: one repo's probe error must not stop the
// plan for the rest (unlike the census, the planner has no coverage verdict to
// protect, so it stays resilient and always emits whatever plan it can).
export async function planAccessibleFleet(gh, home) {
  const mine = await paged(gh, '/user/repos?affiliation=owner');
  const coveredRepos = []; const skipped = []; const unknown = [];
  let homeRepo = null;
  for (const r of mine.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    if (home && r.full_name.toLowerCase() === home.toLowerCase()) { homeRepo = r; continue; } // planned last, with the fleet aggregate
    if (r.archived || r.fork) { skipped.push(`${r.full_name} (${r.archived ? 'archived' : 'fork'})`); continue; }
    try {
      if (await isCovered(gh, r.full_name)) coveredRepos.push(r);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
    }
  }
  const plan = await buildWorkPlan(gh, home, coveredRepos, homeRepo);
  return { plan, coveredCount: coveredRepos.length, skipped, unknown };
}

async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY || '';
  if (!token) {
    throw new Error('No token set (FLEET_GITHUB_TOKEN or GITHUB_TOKEN). The planner enumerates the '
      + 'repos the token can reach; give it one that spans the accessible fleet with Metadata + '
      + 'Contents (read).');
  }
  const gh = makeGh(token);
  const { plan, coveredCount, skipped, unknown } = await planAccessibleFleet(gh, home);
  writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

  const summary = [
    `# Work plan — ${coveredCount} covered repo(s)`,
    '',
    `**Units:** ${plan.units.length}${plan.canonChanged ? ' · canon changed' : ''}`
      + `${plan.errors.length ? ` · ${plan.errors.length} probe error(s)` : ''}`,
    skipped.length ? `**Skipped (fork/archived):** ${skipped.join(', ')}` : '',
    unknown.length ? `**Unclassified (probe errored — isolated, not planned):** ${unknown.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`planner failed: ${e.message}`); process.exit(1); });
}
