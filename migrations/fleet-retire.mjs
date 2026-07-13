#!/usr/bin/env node
// Migration finalization — the fleet-wide RETIRE pass (phase 3 of the daily
// maintenance routine, run after the pack tasks settle). Its own fleet walk,
// migrations-owned: neither the fleet-coverage census nor baselining carries any
// migration logic. See migrations/README.md and routines/auto-all-repos-maintenance.md.
//
// What it does: enumerate the covered fleet, probe every migration's
// `legacyPresent` across it, and auto-retire any migration the whole fleet has
// left behind — deleting the home files it relocated into the consumers
// (retireDeletesFromHome) FIRST, then the record itself. That is the automatic
// phase-2 cut: plumbing moved behind a pack leaves the canon with no leftovers
// once every consumer has vendored the copy.
//
// The QUIESCENCE guard (why this runs AFTER, and separate from, apply): a
// migration is retired only after a full nightly cycle in which the apply pass
// touched it on NO repo. The apply pass (phase 1, migrations/fleet-apply.mjs)
// writes `migrations-applied.json` — the ids it wrote to >=1 repo this cycle.
// This pass reads it and refuses to retire anything in that set (retirableMigrations
// enforces it), so the cycle that converges the last member can never also retire.
// If that file is ABSENT (the apply pass didn't run this cycle) quiescence is
// unproven, so this pass retires nothing — retirement is irreversible, and a
// missing apply signal must never be read as "the fleet is quiet".
//
// It probes only the repos the maintenance routine hands it (as CLI args) — this
// environment's repos, which the routine knows. It does NOT enumerate repos or reach
// account-wide (that is the coverage census's separate job). Auth is the run's own
// token; read-only toward every repo except the home repo (its own), where it deletes
// retired records + their retireDeletesFromHome files.
// Dependency-free (global fetch, Node 20+).

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadMigrations, retirableMigrations, MIGRATIONS_SUBDIR } from './registry.mjs';
import { makeGh, fileExists } from '../routines/fleet/fleet-api.mjs';

const APPLIED_PATH = 'migrations-applied.json'; // written by fleet-apply.mjs this cycle

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

// Retire one fully-applied migration: delete any home files it relocated into the
// consumers (retireDeletesFromHome) FIRST, then the record itself — so a partial
// failure leaves the record to retry the rest next cycle (each home delete
// tolerates an already-gone 404).
export async function retireMigration(gh, home, m) {
  const homeFiles = m.retireDeletesFromHome ?? [];
  for (const p of homeFiles) {
    await deleteFileIfPresent(gh, home, p, `Retire migration ${m.id}: remove ${p} — vendored into every consumer, unused in the canon`);
  }
  const record = `migrations/${MIGRATIONS_SUBDIR}/${m.file}`;
  await deleteFile(gh, home, record,
    `Retire migration ${m.id}: fully applied and quiet across the fleet (0 repos on the legacy shape, 0 applications this cycle)`);
  return `retired ${m.id} — deleted ${record}${homeFiles.length ? ` + ${homeFiles.length} home file(s)` : ''}`;
}

// Read a repo file's decoded content, or null if absent/unreadable — passed to
// `legacyPresent` alongside `exists` for migrations whose legacy shape lives
// inside a file (e.g. a pack seed in .claudinite-checks.json) rather than at a path.
async function readFile(gh, fullName, path) {
  const { status, json } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status !== 200 || !json?.content) return null;
  return Buffer.from(json.content, 'base64').toString('utf8');
}

// This cycle's apply evidence: the set of migration ids fleet-apply wrote to >=1
// repo. `null` means the file is ABSENT (apply didn't run) — the caller then
// retires nothing, because quiescence is unproven.
export function readAppliedThisCycle(path = APPLIED_PATH) {
  if (!existsSync(path)) return null;
  try {
    const ids = JSON.parse(readFileSync(path, 'utf8'));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return null; // unparsable evidence is no evidence
  }
}

// Probe every covered repo for each migration's legacy shape, then retire the ones
// the fleet has left behind AND the apply pass left untouched this cycle. A probe
// error counts as pending (never "clean"), so an API hiccup only ever delays a
// retirement, never triggers a premature one.
export async function runRetirement(gh, home, migrations, covered, unknownCount, today, appliedThisCycle) {
  if (migrations.length === 0) return [];
  const lines = [];
  if (appliedThisCycle === null) {
    return [`no ${APPLIED_PATH} from the apply pass — retiring nothing (quiescence unproven)`];
  }
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
  for (const m of migrations) {
    const appliedNote = appliedThisCycle.has(m.id) ? ', applied this cycle' : '';
    lines.push(`${m.id} — ${pending.get(m.id)} repo(s) still on the legacy shape${appliedNote}`);
  }
  for (const m of retirableMigrations(migrations, { pending, unknownCount, today, appliedThisCycle })) {
    try {
      lines.push(await retireMigration(gh, home, m));
    } catch (e) {
      lines.push(`could not auto-retire ${m.id}: ${e.message} — the maintenance token needs Contents write on ${home}`);
    }
  }
  return [...lines, ...notes];
}

async function main() {
  // The routine hands us the repos to probe (this environment's repos) as CLI args;
  // we don't enumerate. Auth is the run's own token; the home repo (its own) is where
  // retired records + relocated files are deleted. The routine must pass the COMPLETE
  // managed set — retirement fires only when the whole set is clean, so a missing repo
  // could hide drift; a partial list means the routine skips the retire pass.
  const token = process.env.GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  const repos = process.argv.slice(2);
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);
  const today = new Date().toISOString().slice(0, 10);

  const appliedThisCycle = readAppliedThisCycle();
  const migrations = await loadMigrations();
  const lines = await runRetirement(gh, home, migrations, repos, 0, today, appliedThisCycle);

  const summary = ['# Migration finalization', '', ...(lines.length ? lines.map((l) => `- ${l}`) : ['- nothing to retire'])].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`migration finalization failed: ${e.message}`); process.exit(1); });
}
