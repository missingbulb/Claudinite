#!/usr/bin/env node
// Deterministic fleet-coverage census — Claudinite core, run by the sheepdog
// repo's Fleet Coverage workflow (materialized from the sheepdog pack's stub by
// baselining — workflow_dispatch only, no schedule of its own), which checks out
// Claudinite and runs this with the FLEET_GITHUB_TOKEN.
//
// Reads the fleet config from the sheepdog (home) repo's packConfig.sheepdog
// (owner to cover + exclude list), enumerates every repo under that owner,
// classifies each (covered / uncovered / excluded / skipped fork-or-archived),
// publishes the picture to the run summary, and converges one adoption issue per
// actionable uncovered repo in the home repo: open while uncovered, closed once
// covered or excluded. It also emits the day's work plan (plan.json) and runs
// baseline-migration retirement telemetry.
//
// Two rules kept deliberately:
//   - a marker check that ERRORS makes the repo UNKNOWN, never uncovered — no
//     issue is opened for it and the run fails so the error escalates;
//   - an unreadable/absent packConfig.sheepdog aborts the census — absence is
//     not consent to cover everything with no exclusions.
//
// Dependency-free (global fetch, Node 20+); read-only toward every repo except
// the home repo, where it writes the adoption issues + label and deletes
// fully-applied migration files (auto-retirement — see migrations/README.md).

import { writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadMigrations, retirableMigrations } from '../migrations/registry.mjs';
import { loadPacks } from '../packs/registry.mjs';
import { packTasks, assembleForRepo } from './fleet/registry.mjs';
import { buildSignals, computeCanonChanged } from './fleet/signals.mjs';
import { planRepo } from './fleet/gates.mjs';

const API = 'https://api.github.com';
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

// --- GitHub API -------------------------------------------------------------

function makeGh(token) {
  return async function gh(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, json };
  };
}

async function paged(gh, path) {
  const sep = path.includes('?') ? '&' : '?';
  const all = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`${path}${sep}per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(json)) {
      throw new Error(`GET ${path} page ${page} failed with status ${status}`);
    }
    all.push(...json);
    if (json.length < 100) return all;
  }
}

// --- classification ---------------------------------------------------------

// 200 → true, 404 → false, anything else → error (the caller marks UNKNOWN).
async function fileExists(gh, fullName, path) {
  const { status } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status === 200) return true;
  if (status === 404) return false;
  throw new Error(`marker check ${fullName}:${path} returned ${status}`);
}

async function isCovered(gh, fullName) {
  if (await fileExists(gh, fullName, '.claudinite/sync-claudinite.sh')) return true; // Method B
  if (await fileExists(gh, fullName, '.claudinite/.gitkeep')) return true; // legacy Method B
  const { status, json } = await gh(`/repos/${fullName}/contents/.gitmodules`);
  if (status === 404) return false;
  if (status !== 200) throw new Error(`marker check ${fullName}:.gitmodules returned ${status}`);
  const text = Buffer.from(json.content ?? '', 'base64').toString('utf8');
  return /path\s*=\s*\.claudinite\b/.test(text) && /url\s*=\s*.*claudinite/i.test(text); // Method A
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
      await deleteFile(gh, home, `migrations/${m.file}`,
        `Retire migration ${m.id}: fully applied across the fleet (0 repos on the legacy shape)`);
      lines.push(`retired ${m.id} — deleted migrations/${m.file}`);
    } catch (e) {
      lines.push(`could not auto-retire ${m.id}: ${e.message} — grant FLEET_GITHUB_TOKEN Contents write on ${home}`);
    }
  }
  return [...lines, ...notes];
}

// --- work plan (the third thing this one fleet walk emits) -------------------

const PLAN_PATH = 'plan.json'; // cwd-relative in the Action; ephemeral, uploaded as an artifact, never committed

// For each covered member: build its signal bundle, resolve its applicable tasks
// (fleet-core ∪ its active packs' maintenance), and run each gate. Every run:true
// verdict becomes a unit the orchestrator dispatches — the whole worklist decided in
// code here, before any worker agent runs. A member whose probe throws is isolated:
// it contributes no units and an error note, never sinking the plan.
export async function buildWorkPlan(gh, home, coveredRepos) {
  const sinceIso = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const weekdayUtc = new Date().getUTCDay();
  const canonChanged = await computeCanonChanged(gh, home, sinceIso);
  const allPackTasks = packTasks(await loadPacks());

  const units = []; const errors = [];
  for (const r of coveredRepos) {
    try {
      const signals = await buildSignals(gh, r, { sinceIso, weekdayUtc, canonChanged });
      const applicable = assembleForRepo(signals.activePacks, allPackTasks);
      const res = await planRepo({ fullName: r.full_name, defaultBranch: r.default_branch }, signals, applicable, gh);
      units.push(...res.units); errors.push(...res.errors);
    } catch (e) {
      errors.push({ repo: r.full_name, error: e.message });
    }
  }
  return { generatedAt: new Date().toISOString(), windowStartUtc: sinceIso, weekdayUtc, canonChanged, units, errors };
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
  const coveredRepos = []; // the repo objects behind `covered`, for the work plan
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
    if (isCov) { covered.push(fullName); coveredRepos.push(r); }
    else if (optOut.has(fullName)) optedOut.push(fullName);
    else uncovered.push(fullName);
  }

  await ensureLabel(gh, home);
  const actions = await convergeIssues(gh, home, {
    uncovered, coveredSet: new Set(covered), optedOutSet: new Set(optedOut),
  });

  const today = new Date().toISOString().slice(0, 10);
  const migrationLines = await runMigrationTelemetry(gh, home, covered, unknown.length, today);

  // Emit the work plan. A plan failure is logged but must not sink the census's
  // coverage + migration duties, so it's wrapped and never throws.
  let planLine;
  try {
    const plan = await buildWorkPlan(gh, home, coveredRepos);
    writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);
    planLine = `**Plan:** ${plan.units.length} unit(s)`
      + (plan.canonChanged ? ', canon changed' : '')
      + (plan.errors.length ? `, ${plan.errors.length} probe error(s)` : '');
  } catch (e) {
    writeFileSync(PLAN_PATH, `${JSON.stringify({ units: [], planError: e.message }, null, 2)}\n`);
    planLine = `**Plan:** FAILED — ${e.message}`;
  }

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
    planLine,
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
