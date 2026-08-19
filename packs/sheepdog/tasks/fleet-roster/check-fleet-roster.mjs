#!/usr/bin/env node
// The sheepdog pack's fleet ROSTER sweep — one walk of the fleet answering the
// enforcer's two standing questions about every repo under the owner:
//
//   is this repo a MEMBER?           → `fleet-adoption` issues   (adoption-issues.mjs)
//   is that membership still MEANING anything?
//                                    → `fleet-drift` issues      (drift-issues.mjs)
//
// Run by this pack's `fleet-roster` scheduled task, whose worker calls `main()` below
// as the task's `code_work` — Action-side inside the enforcer repo's scheduler workflow,
// where the FLEET_GITHUB_TOKEN the task declares in `required_secrets` is reachable as
// ordinary environment. Still runnable by hand (`node check-fleet-roster.mjs`) via the
// CLI guard at the foot.
//
// WHY ONE WALK (#788). The two questions were two tasks, and each carried its own
// enumeration, its own owner filter, its own empty-enumeration guard, its own
// home/canon/archived/fork/excluded skips and its own declaration read per repo. The
// freshness half's header claimed it "takes coverage as given" while in fact
// re-deriving it, on another cadence, in another process — so the two classifications
// could disagree and did: `exclude` was applied at different points (an excluded repo
// that still carried a declaration read `covered` to one and `out of scope` to the
// other), and each half's `unknown` failed its own run knowing nothing of the other's.
// The roster is now built ONCE and both halves consume it, so a repo has one
// membership verdict and the report has one failure boundary.
//
// WHAT IS STILL SEPARATE, deliberately: the two ISSUE FAMILIES. Coverage and drift
// close on unrelated conditions and carry unrelated remedies, so each keeps its own
// label, its own convergence policy and its own section of the report, in its own
// module. This file owns the walk and nothing else.
//
// UNKNOWN IS PER-QUESTION, which is the one behaviour the merge changes. A declaration
// that cannot be read or parsed is unknown to BOTH halves — it is the input they share.
// A mount probe that fails (the scheduler read, canon's compare) is unknown to the
// FRESHNESS half alone: the coverage half already read that repo's declaration
// successfully and keeps its verdict. Either kind of unknown fails the run, so nothing
// is downgraded to silence; what changes is that a compare outage no longer erases a
// repo from the coverage picture.
//
// Two rules kept from both predecessors:
//   - an indeterminate repo is UNKNOWN, never a finding — no issue is opened for it,
//     and the run fails so the cause escalates;
//   - an unreadable/absent sheepdog config aborts the sweep — absence is not consent
//     to cover everything with no exclusions.
//
// Dependency-free (global fetch, Node 20+); read-only toward every repo except the
// enforcer, where it writes the two issue families and their labels.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, readDeclaration, isDormant, ensureLabel, DECLARATION } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';
import * as adoption from './adoption-issues.mjs';
import * as drift from './drift-issues.mjs';

// --- the roster walk ----------------------------------------------------------

// One entry per repo under the owner, carrying FACTS rather than a verdict: the two
// halves disagree about what some of those facts mean (an excluded repo is still
// `covered` to the coverage question and out of scope to the freshness one), and a
// single pre-chewed state would have to pick a winner. The views below do the
// interpreting, each for its own question.
//
// Reads per repo: the declaration, once — the read both halves needed and each used to
// make separately. Plus two more (scheduler workflow, canon compare) for the members
// the freshness half actually measures, and canon's version numbers, which the shared
// `canonVersions` reader fetches once per distinct pack across the whole walk.
export async function buildRoster(gh, repos, {
  home, canonRepo, canonBranch, exclude, canonVersions,
}) {
  const roster = [];
  for (const r of repos.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    const entry = {
      fullName,
      displayName: r.full_name,
      isHome: fullName === home.toLowerCase(),
      isCanon: fullName === canonRepo.toLowerCase(),
      archived: Boolean(r.archived),
      fork: Boolean(r.fork),
      excluded: exclude.has(fullName),
      declaration: null,
      declarationError: null,
      dormant: false,
      freshness: null,
      freshnessError: null,
    };
    roster.push(entry);

    // The enforcer is not censused and not swept; an archived repo or a fork is
    // neither. Nothing below would be read for any of them, so nothing is.
    if (entry.isHome || entry.archived || entry.fork) continue;

    // The declaration is READ, not merely probed for existence: dormancy and the
    // stamp both live inside it. An unparsable one is UNKNOWN rather than uncovered,
    // because a file that cannot be read says nothing.
    try {
      entry.declaration = await readDeclaration(gh, r.full_name);
    } catch (e) {
      entry.declarationError = e.message;
      continue;
    }
    if (entry.declaration === null) continue;   // uncovered — the coverage half's subject
    entry.dormant = isDormant(entry.declaration);

    // Which members the freshness half measures: covered, awake, in scope, and neither
    // the enforcer nor canon. A DORMANT member stops here — its scheduler stops before
    // it evaluates anything, so its mount falls behind BY DESIGN, and every freshness
    // state would report a repo for obeying its own declaration.
    if (entry.dormant || entry.isCanon || entry.excluded) continue;

    try {
      const mount = await drift.probeMount(gh, r.full_name, entry.declaration, { canonRepo, canonBranch, canon: canonVersions });
      entry.freshness = drift.classifyFreshness(mount);
    } catch (e) {
      entry.freshnessError = e.message;
    }
  }
  return roster;
}

// --- the two views (pure) -----------------------------------------------------

// The coverage question's buckets. Note what is NOT consulted: `isCanon` (canon carries
// a declaration and is an ordinary covered member here) and `freshnessError` (a mount
// this half never asked about). `excluded` matters only once a repo turns out to be
// uncovered — an excluded repo that still carries a declaration is covered, and saying
// otherwise would report a repo as missing something it has.
export function coverageView(roster) {
  const covered = []; const dormant = []; const uncovered = []; const optedOut = []; const skipped = []; const unknown = [];
  for (const e of roster) {
    if (e.isHome) continue;                       // named in the summary, not censused
    if (e.archived || e.fork) { skipped.push(`${e.displayName} (${e.archived ? 'archived' : 'fork'})`); continue; }
    if (e.declarationError) { unknown.push(`${e.displayName} — ${e.declarationError}`); continue; }
    if (e.declaration !== null) (e.dormant ? dormant : covered).push(e.fullName);
    else if (e.excluded) optedOut.push(e.fullName);
    else uncovered.push(e.fullName);
  }
  return { covered, dormant, uncovered, optedOut, skipped, unknown };
}

// The freshness question's buckets. `gone` is names only — what convergeDrift closes as
// out-of-fleet; `outOfScope` carries the same repos WITH their reasons, for the report.
// Dormant members are counted separately from `gone` so the summary says how much of the
// fleet is asleep rather than hiding it inside "out of scope".
export function freshnessView(roster) {
  const fresh = []; const unhealthy = []; const dormant = []; const outOfScope = []; const unknown = []; const gone = [];
  for (const e of roster) {
    if (e.isHome || e.isCanon) continue;          // named in the summary, never measured
    if (e.archived || e.fork) { outOfScope.push(`${e.displayName} (${e.archived ? 'archived' : 'fork'})`); gone.push(e.fullName); continue; }
    if (e.excluded) { outOfScope.push(`${e.displayName} (excluded)`); gone.push(e.fullName); continue; }
    if (e.declarationError) { unknown.push(`${e.displayName} — ${e.declarationError}`); continue; }
    if (e.declaration === null) { outOfScope.push(`${e.displayName} (uncovered — the adoption half's subject)`); gone.push(e.fullName); continue; }
    if (e.dormant) { dormant.push(e.fullName); continue; }
    if (e.freshnessError) { unknown.push(`${e.displayName} — ${e.freshnessError}`); continue; }
    if (e.freshness.state === drift.FRESH) fresh.push({ fullName: e.fullName, detail: e.freshness.detail });
    else unhealthy.push({ fullName: e.fullName, ...e.freshness });
  }
  return { fresh, unhealthy, dormant, outOfScope, unknown, gone };
}

// --- main --------------------------------------------------------------------

// Exported so the fleet-roster task's worker can invoke the sweep in-process rather
// than reimplementing it; the CLI guard below keeps the standalone run.
export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read + Issues read/write) — '
      + 'the default GITHUB_TOKEN sees only this repo and cannot sweep the fleet.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  // Read the fleet config from this (sheepdog) repo's sheepdog pack entry.
  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, exclude, canonRepo } = parseSheepdogConfig(cfg, home);

  // Canon's default branch is what "on trunk" means; read it rather than assuming main.
  const canonRes = await gh(`/repos/${canonRepo}`);
  if (canonRes.status !== 200 || !canonRes.json?.default_branch) {
    throw new Error(`canon repo ${canonRepo} is unreadable (status ${canonRes.status}) — set canonRepo on the sheepdog pack entry's config if it is not ${owner}/Claudinite`);
  }
  const canonBranch = canonRes.json.default_branch;

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope; `
      + 'refusing to run a sweep that would close every adoption and drift issue as stale');
  }

  const roster = await buildRoster(gh, mine, {
    home, canonRepo, canonBranch, exclude, canonVersions: drift.canonVersions(gh, canonRepo),
  });
  const coverage = coverageView(roster);
  const freshness = freshnessView(roster);

  await ensureLabel(gh, home, adoption.LABEL, adoption.LABEL_SPEC);
  const coverageActions = await adoption.convergeAdoption(gh, home, {
    uncovered: coverage.uncovered,
    coveredSet: new Set([...coverage.covered, ...coverage.dormant]),
    optedOutSet: new Set(coverage.optedOut),
  });

  await ensureLabel(gh, home, drift.LABEL, drift.LABEL_SPEC);
  const driftActions = await drift.convergeDrift(gh, home, {
    unhealthy: freshness.unhealthy,
    healthySet: new Set(freshness.fresh.map((f) => f.fullName)),
    goneSet: new Set(freshness.gone),
    dormantSet: new Set(freshness.dormant),
  });

  // Two sections, one report: the questions are separate and read separately, but a
  // reader now gets both from one run rather than correlating two.
  const summary = [
    adoption.renderCoverageSummary({ owner, home, ...coverage, actions: coverageActions }),
    drift.renderFreshnessSummary({
      owner, home, canonRepo, canonBranch, ...freshness, actions: driftActions,
    }),
  ].join('\n\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  // Either half's unknowns fail the run. Reported together so one escalation names
  // everything indeterminate rather than whichever half happened to run first.
  const unknown = [...coverage.unknown, ...freshness.unknown];
  if (unknown.length) {
    throw new Error(`${unknown.length} repo classification(s) could not be made — unknown is neither `
      + 'uncovered nor behind, no issues were opened for them, and this run fails so the cause is escalated');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-roster sweep failed: ${e.message}`); process.exit(1); });
}
