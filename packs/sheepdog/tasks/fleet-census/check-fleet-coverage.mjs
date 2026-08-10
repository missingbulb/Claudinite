#!/usr/bin/env node
// The sheepdog pack's fleet-coverage CENSUS — the cross-repo reach the pack adds.
// Run by this pack's `fleet-census` scheduled task (tasks/fleet-census/), whose
// worker calls `main()` below as the task's `prework` — Action-side
// inside the repo's scheduler workflow, where the FLEET_GITHUB_TOKEN the task
// declares in `required_secrets` is reachable as ordinary environment. Still
// runnable by hand (`node check-fleet-coverage.mjs`) via the CLI guard at the foot.
//
// Its concern is COVERAGE ALONE — one thing: reads the fleet config from the
// sheepdog (home) repo's sheepdog pack-entry config (owner to cover + exclude list),
// enumerates every repo under that owner, classifies each (covered / dormant /
// uncovered / excluded / skipped fork-or-archived), publishes the picture to the run
// summary — the FULL roster, every repo named under exactly one state, never only
// the exceptions — and converges one adoption issue per actionable uncovered repo in the home repo
// (open while uncovered, closed once covered or excluded). That issue is its ENTIRE
// effect on an uncovered repo — the census never writes to one, and nothing downstream
// adopts it either: the owner reads the issue and chooses to adopt Claudinite or to
// ignore it. It does NOT build the
// work plan (that is each repo's own scheduler's job, engine/scheduler/run.mjs) and it does
// NOT touch migrations: each member applies those itself, from the fresh canon
// clone its own baselining fetches (migrations/apply.mjs) — the census is a
// coverage audit, not a migrations helper.
//
// Two rules kept deliberately:
//   - a marker check that ERRORS makes the repo UNKNOWN, never uncovered — no
//     issue is opened for it and the run fails so the error escalates;
//   - an unreadable/absent sheepdog config aborts the census — absence is
//     not consent to cover everything with no exclusions.
//
// Dependency-free (global fetch, Node 20+); read-only toward every repo except the
// home repo, where it writes the adoption issues + label.
// It lives IN its task's folder (tasks/fleet-census/) because nothing else uses it —
// only this task's worker.mjs imports it. What IS shared with the freshness sweep sits
// at the pack root: the cross-repo REST primitives (fleet-api.mjs) and the config
// reader (fleet-config.mjs).

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, readDeclaration, isDormant, ensureLabel, labeledIssues } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

const LABEL = 'fleet-adoption';
const adoptionTitle = (fullName) => `Adopt ${fullName} into the Claudinite fleet`;
const TITLE_RE = /^Adopt (\S+\/\S+) into the Claudinite fleet$/;

function adoptionBody(fullName) {
  return [
    `\`${fullName}\` exists under this account but does not mount Claudinite (no tracked`,
    '`.claudinite/` signal on its default branch) and is not on the exclude list.',
    '',
    'Pick one:',
    '',
    '- **Adopt it** — run the adoption in a session on that repo (ask for "adopt Claudinite";',
    '  the `adopt-claudinite` skill drives `bootstrap.md`). This is a human-initiated step by',
    '  design: adoption is the one thing a repo cannot do for itself, because the scheduler',
    '  that would run it is what adoption installs. Nothing will do it on your behalf.',
    `- **Keep it out** — add \`${fullName}\` to the sheepdog pack entry's \`config.exclude\` in this`,
    '  (sheepdog) repo\'s `.claudinite-checks.json`, with a reason.',
    '',
    'This issue is converged by the daily fleet-census task: it closes itself once the',
    'repo is covered (`completed`) or opted out (`not planned`), and a close without either',
    'gets reopened while the repo stays uncovered.',
  ].join('\n');
}

// --- adoption-issue convergence ----------------------------------------------

async function convergeIssues(gh, home, { uncovered, coveredSet, optedOutSet }) {
  const actions = [];
  const { open: openIssues, closed } = await labeledIssues(gh, home, LABEL);
  const open = new Map(openIssues.map((i) => [i.title, i]));

  for (const fullName of uncovered) {
    const title = adoptionTitle(fullName);
    if (open.has(title)) continue;
    const prior = closed.filter((i) => i.title === title)
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))[0];
    if (prior && prior.state_reason === 'not_planned') continue; // owner declined; opt-out is the standing fix
    if (prior) {
      await gh(`/repos/${home}/issues/${prior.number}`, { method: 'PATCH', body: { state: 'open' } });
      await gh(`/repos/${home}/issues/${prior.number}/comments`, {
        method: 'POST', body: { body: `Reopened by the census: \`${fullName}\` is still uncovered.` },
      });
      actions.push(`reopened #${prior.number} (${fullName})`);
    } else {
      const { status, json } = await gh(`/repos/${home}/issues`, {
        method: 'POST',
        body: { title, body: adoptionBody(fullName), labels: [LABEL] },
      });
      if (status !== 201) throw new Error(`creating adoption issue for ${fullName} returned ${status}`);
      actions.push(`opened #${json.number} (${fullName})`);
    }
  }

  for (const [title, issue] of open) {
    const m = TITLE_RE.exec(title);
    if (!m) continue;
    const fullName = m[1].toLowerCase();
    let reason = null; let note = null;
    if (coveredSet.has(fullName)) {
      reason = 'completed'; note = 'now mounts Claudinite — covered';
    } else if (optedOutSet.has(fullName)) {
      reason = 'not_planned'; note = "on the exclude list (the sheepdog pack entry's config.exclude)";
    } else if (!uncovered.includes(fullName)) {
      reason = 'not_planned'; note = 'no longer an adoption candidate (deleted, archived, transferred, or now a fork)';
    }
    if (!reason) continue;
    await gh(`/repos/${home}/issues/${issue.number}/comments`, {
      method: 'POST', body: { body: `Closed by the census: \`${m[1]}\` ${note}.` },
    });
    await gh(`/repos/${home}/issues/${issue.number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: reason },
    });
    actions.push(`closed #${issue.number} (${m[1]}: ${note})`);
  }
  return actions;
}

// --- the run summary (pure) ---------------------------------------------------

// The census's report enumerates the FULL fleet: every repo lands in exactly one
// list below, whatever its state — covered, dormant, uncovered, opted out, skipped,
// unknown — plus the enforcer itself, which is not censused but still named. A
// roster that names only the exceptions has silent holes, and a reader cannot tell
// "fine" from "fell out of the report". Kept free of I/O so the full-roster
// property is testable directly.
export function renderCensusSummary({ owner, home, covered, dormant, uncovered, optedOut, skipped, unknown, actions }) {
  return [
    `# Fleet coverage census — ${owner}`,
    '',
    '| covered | dormant | uncovered | opted out | skipped (fork/archived) | unknown |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${covered.length} | ${dormant.length} | ${uncovered.length} | ${optedOut.length} | ${skipped.length} | ${unknown.length} |`,
    '',
    covered.length ? `**Covered:** ${covered.join(', ')}` : '**Covered:** none',
    dormant.length ? `**Covered but dormant (self-declared, upkeep stopped):** ${dormant.join(', ')}` : '',
    uncovered.length ? `**Uncovered (adoption issue open):** ${uncovered.join(', ')}` : '**Uncovered:** none 🎉',
    optedOut.length ? `**Opted out (config.exclude):** ${optedOut.join(', ')}` : '',
    skipped.length ? `**Skipped:** ${skipped.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (declaration read errored — fix the token/scope):** ${unknown.join('; ')}` : '',
    `**Not censused:** ${home} — the enforcer itself`,
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
  ].filter(Boolean).join('\n');
}

// --- main --------------------------------------------------------------------

// Exported so the fleet-census task's worker can invoke the census in-process
// rather than reimplementing it; the CLI guard below keeps the standalone run.
export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read + Issues read/write) — '
      + 'the default GITHUB_TOKEN sees only this repo and cannot take a fleet census.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  // Read the fleet config from this (sheepdog) repo's sheepdog pack entry.
  const cfgRes = await gh(`/repos/${home}/contents/.claudinite-checks.json`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable .claudinite-checks.json (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable .claudinite-checks.json on ${home}: ${e.message}`);
  }
  const { owner, exclude: optOut } = parseSheepdogConfig(cfg, home);

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope; `
      + 'refusing to run a census that would close every adoption issue as stale');
  }

  const covered = []; const dormant = []; const uncovered = []; const optedOut = []; const skipped = []; const unknown = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    if (fullName === home.toLowerCase()) continue; // the enforcer itself — named in the summary, not censused
    if (r.archived || r.fork) { skipped.push(`${r.full_name} (${r.archived ? 'archived' : 'fork'})`); continue; }
    // The declaration is READ, not merely probed for existence: dormancy lives inside
    // it, and the roster names dormant members as dormant. Dormancy does not touch
    // MEMBERSHIP — a dormant repo is covered, its adoption issue converges the same —
    // it only annotates the report. One deliberate tightening rides along: an
    // unparsable declaration now classifies UNKNOWN (and fails the run) instead of
    // covered, because a file that cannot be read says nothing.
    let decl;
    try {
      decl = await readDeclaration(gh, r.full_name);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
      continue;
    }
    if (decl !== null) (isDormant(decl) ? dormant : covered).push(fullName);
    else if (optOut.has(fullName)) optedOut.push(fullName);
    else uncovered.push(fullName);
  }

  await ensureLabel(gh, home, LABEL, { color: '1D76DB', description: 'Repo awaiting adoption into the Claudinite fleet' });
  const actions = await convergeIssues(gh, home, {
    uncovered, coveredSet: new Set([...covered, ...dormant]), optedOutSet: new Set(optedOut),
  });

  const summary = renderCensusSummary({ owner, home, covered, dormant, uncovered, optedOut, skipped, unknown, actions });

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (unknown.length) {
    throw new Error(`${unknown.length} repo(s) could not be classified — unknown is not uncovered, `
      + 'no adoption issues were opened for them, and this run fails so the cause is escalated');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-coverage census failed: ${e.message}`); process.exit(1); });
}
