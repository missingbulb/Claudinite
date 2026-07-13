#!/usr/bin/env node
// The sheepdog pack's fleet-coverage CENSUS — the cross-repo reach the pack adds.
// Run by the sheepdog repo's coverage workflow (materialized from the pack's stub
// by baselining — workflow_dispatch only, no schedule of its own), which checks
// out Claudinite and runs this with the FLEET_GITHUB_TOKEN.
//
// Its concern is COVERAGE, not planning: reads the fleet config from the sheepdog
// (home) repo's packConfig.sheepdog (owner to cover + exclude list), enumerates
// every repo under that owner, classifies each (covered / uncovered / excluded /
// skipped fork-or-archived), publishes the picture to the run summary, converges
// one adoption issue per actionable uncovered repo in the home repo (open while
// uncovered, closed once covered or excluded), and runs baseline-migration
// retirement telemetry. It does NOT build the work plan — that is the core
// planner's job (routines/fleet/plan.mjs), pack-agnostic and independent of this
// census; the census is just one run_daily task among the plan's units.
//
// Two rules kept deliberately:
//   - a marker check that ERRORS makes the repo UNKNOWN, never uncovered — no
//     issue is opened for it and the run fails so the error escalates;
//   - an unreadable/absent packConfig.sheepdog aborts the census — absence is
//     not consent to cover everything with no exclusions.
//
// Dependency-free (global fetch, Node 20+); read-only toward every repo except
// the home repo, where it writes the adoption issues + label and, on
// auto-retirement, deletes a fully-applied migration's record — plus any home
// files that migration relocated into the consumers (its retireDeletesFromHome),
// so plumbing moved behind a pack leaves the canon with no leftovers. See
// migrations/README.md.
// The shared cross-repo primitives live in routines/fleet/fleet-api.mjs (core).

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadMigrations, retirableMigrations } from '../../migrations/registry.mjs';
import { makeGh, paged, fileExists, isCovered } from '../../routines/fleet/fleet-api.mjs';

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
    '- **Adopt it** — grant the repo to the sheepdog environment\'s per-repo access list;',
    '  the next daily run then baselines (bootstraps) it automatically.',
    `- **Keep it out** — add \`${fullName}\` to \`packConfig.sheepdog.exclude\` in this`,
    '  (sheepdog) repo\'s `.claudinite-checks.json`, with a reason.',
    '',
    'This issue is converged by the daily Fleet Coverage census: it closes itself once the',
    'repo is covered (`completed`) or opted out (`not planned`), and a close without either',
    'gets reopened while the repo stays uncovered.',
  ].join('\n');
}

// --- fleet config (from the sheepdog repo's packConfig.sheepdog) --------------

// The sheepdog repo's .claudinite-checks.json carries:
//   packConfig.sheepdog = { owner: "missingbulb", kind: "user", exclude: ["owner/repo", ...] }
// owner is who to cover (default: the sheepdog repo's own owner); exclude is the repos
// deliberately kept out (a full owner/name each, lowercased). Missing packConfig.sheepdog
// is an unreadable config: throw — absence is not consent to cover everything.
export function parseSheepdogConfig(cfg, home) {
  const sd = cfg?.packConfig?.sheepdog;
  if (!sd || typeof sd !== 'object') {
    throw new Error(`the sheepdog repo ${home} declares no packConfig.sheepdog { owner, exclude } — nothing to cover`);
  }
  const owner = String(sd.owner ?? home.split('/')[0]).toLowerCase();
  const exclude = new Set((Array.isArray(sd.exclude) ? sd.exclude : []).map((s) => String(s).toLowerCase()));
  return { owner, exclude };
}

// --- adoption-issue convergence ----------------------------------------------

async function ensureLabel(gh, home) {
  const { status } = await gh(`/repos/${home}/labels`, {
    method: 'POST',
    body: { name: LABEL, color: '1D76DB', description: 'Repo awaiting adoption into the Claudinite fleet' },
  });
  if (status !== 201 && status !== 422) throw new Error(`creating label ${LABEL} returned ${status}`);
}

async function convergeIssues(gh, home, { uncovered, coveredSet, optedOutSet }) {
  const actions = [];
  const all = (await paged(gh, `/repos/${home}/issues?labels=${LABEL}&state=all`))
    .filter((i) => !i.pull_request);
  const open = new Map(all.filter((i) => i.state === 'open').map((i) => [i.title, i]));
  const closed = all.filter((i) => i.state === 'closed');

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
      reason = 'not_planned'; note = 'on the exclude list (packConfig.sheepdog.exclude)';
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

// --- migration telemetry + auto-retirement -----------------------------------

async function deleteFile(gh, home, path, message) {
  const head = await gh(`/repos/${home}/contents/${path}`);
  if (head.status !== 200 || !head.json?.sha) {
    throw new Error(`cannot resolve ${path} to delete (status ${head.status})`);
  }
  const res = await gh(`/repos/${home}/contents/${path}`, {
    method: 'DELETE',
    body: { message, sha: head.json.sha },
  });
  if (res.status !== 200) throw new Error(`deleting ${path} returned ${res.status}`);
}

// Like deleteFile but a 404 (already gone) is success, not an error — so a
// migration whose retirement removes several home files can be retried after a
// partial run without tripping on the ones already deleted.
async function deleteFileIfPresent(gh, home, path, message) {
  const head = await gh(`/repos/${home}/contents/${path}`);
  if (head.status === 404) return;
  if (head.status !== 200 || !head.json?.sha) {
    throw new Error(`cannot resolve ${path} to delete (status ${head.status})`);
  }
  const res = await gh(`/repos/${home}/contents/${path}`, {
    method: 'DELETE',
    body: { message, sha: head.json.sha },
  });
  if (res.status !== 200) throw new Error(`deleting ${path} returned ${res.status}`);
}

// Retire one fully-applied migration: delete any home files it relocated into
// the consumers (retireDeletesFromHome) FIRST, then the record itself — so a
// partial failure leaves the record to retry the rest next night (each home
// delete tolerates an already-gone 404). This is the automatic phase-2 cut: a
// migration that moved plumbing behind a pack leaves the canon with no leftovers
// once the fleet has vendored it. Needs FLEET_GITHUB_TOKEN with Contents write on
// the home repo (#239); until granted, the caller logs the grant hint and the
// core copies stay in place (harmless — every consumer already runs off its own).
export async function retireMigration(gh, home, m) {
  const homeFiles = m.retireDeletesFromHome ?? [];
  for (const p of homeFiles) {
    await deleteFileIfPresent(gh, home, p, `Retire migration ${m.id}: remove ${p} — vendored into every consumer, unused in the canon`);
  }
  await deleteFile(gh, home, `migrations/${m.file}`,
    `Retire migration ${m.id}: fully applied across the fleet (0 repos on the legacy shape)`);
  return `retired ${m.id} — deleted migrations/${m.file}${homeFiles.length ? ` + ${homeFiles.length} home file(s)` : ''}`;
}

// Probe every covered repo for each migration's legacy shape, report the pending
// counts, and auto-retire (delete from home) any migration the whole fleet has
// left behind — the guard lives in retirableMigrations (migrations/registry.mjs).
// A probe error counts as pending (never as "clean"), so an API hiccup can only
// delay a retirement, never trigger a premature one.
// Read a repo file's decoded content, or null if absent/unreadable. Migrations whose
// legacy shape lives inside a file (e.g. a pack seed in .claudinite-checks.json), not
// at a path, read content via this — passed to legacyPresent alongside `exists`.
async function readFile(gh, fullName, path) {
  const { status, json } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status !== 200 || !json?.content) return null;
  return Buffer.from(json.content, 'base64').toString('utf8');
}

async function runMigrationTelemetry(gh, home, covered, unknownCount, today) {
  const migrations = await loadMigrations();
  if (migrations.length === 0) return [];
  const pending = new Map(migrations.map((m) => [m.id, 0]));
  const notes = [];
  for (const fullName of covered) {
    const exists = (path) => fileExists(gh, fullName, path);
    const read = (path) => readFile(gh, fullName, path);
    for (const m of migrations) {
      let stillLegacy;
      try {
        stillLegacy = await m.legacyPresent(exists, read);
      } catch (e) {
        stillLegacy = true;
        notes.push(`${m.id}: probe on ${fullName} errored (${e.message}) — counted pending`);
      }
      if (stillLegacy) pending.set(m.id, pending.get(m.id) + 1);
    }
  }
  const lines = migrations.map((m) => `${m.id} — ${pending.get(m.id)} repo(s) still on the legacy shape`);
  for (const m of retirableMigrations(migrations, { pending, unknownCount, today })) {
    try {
      lines.push(await retireMigration(gh, home, m));
    } catch (e) {
      lines.push(`could not auto-retire ${m.id}: ${e.message} — grant FLEET_GITHUB_TOKEN Contents write on ${home}`);
    }
  }
  return [...lines, ...notes];
}

// --- main --------------------------------------------------------------------

async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read + Issues read/write; '
      + 'Contents WRITE on the home repo for migration auto-retirement) — the default '
      + 'GITHUB_TOKEN sees only this repo and cannot take a fleet census.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  // Read the fleet config from this (sheepdog) repo's packConfig.sheepdog.
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

  const covered = []; const uncovered = []; const optedOut = []; const skipped = []; const unknown = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    if (fullName === home.toLowerCase()) continue; // the canon doesn't mount itself
    if (r.archived || r.fork) { skipped.push(`${r.full_name} (${r.archived ? 'archived' : 'fork'})`); continue; }
    let isCov;
    try {
      isCov = await isCovered(gh, r.full_name);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
      continue;
    }
    if (isCov) covered.push(fullName);
    else if (optOut.has(fullName)) optedOut.push(fullName);
    else uncovered.push(fullName);
  }

  await ensureLabel(gh, home);
  const actions = await convergeIssues(gh, home, {
    uncovered, coveredSet: new Set(covered), optedOutSet: new Set(optedOut),
  });

  const today = new Date().toISOString().slice(0, 10);
  const migrationLines = await runMigrationTelemetry(gh, home, covered, unknown.length, today);

  const summary = [
    `# Fleet coverage census — ${owner}`,
    '',
    `| covered | uncovered | opted out | skipped (fork/archived) | unknown |`,
    `| --- | --- | --- | --- | --- |`,
    `| ${covered.length} | ${uncovered.length} | ${optedOut.length} | ${skipped.length} | ${unknown.length} |`,
    '',
    uncovered.length ? `**Uncovered (adoption issue open):** ${uncovered.join(', ')}` : '**Uncovered:** none 🎉',
    optedOut.length ? `**Opted out:** ${optedOut.join(', ')}` : '',
    skipped.length ? `**Skipped:** ${skipped.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (marker check errored — fix the token/scope):** ${unknown.join('; ')}` : '',
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
    migrationLines.length ? `**Migrations:** ${migrationLines.join('; ')}` : '',
  ].filter(Boolean).join('\n');

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
