// Migration finalization — the fleet-wide RETIRE pass (phase 3 of the daily
// maintenance routine, run after the pack tasks settle). Migrations-owned:
// baselining carries no migration logic. See migrations/README.md and
// routines/auto-all-repos-maintenance.md.
//
// What it does: over the repos the routine hands it, probe every migration's
// `legacyPresent`, and auto-retire any migration the whole fleet has left behind —
// deleting the files it relocated into the consumers (retireDeletesFromHome) FIRST,
// then the record itself. Retirement acts on the CANON repo — the SAME repo the
// migrations are loaded from (migrations/active_migrations/): there is no separate
// "home repo" to discover. The orchestrator names that repo (a known constant) when
// it loads the migrations and again here; loading and retiring a migration are one
// place, not two processes of discovery.
//
// The QUIESCENCE guard (why this runs AFTER, and separate from, apply): a migration
// is retired only after a full nightly cycle in which the apply pass touched it on NO
// repo. The apply pass returns the ids it applied this cycle; the orchestrator hands
// that set here as `appliedThisCycle`, and retirableMigrations refuses to retire
// anything in it — so the cycle that converges the last member can never also retire.
// If that evidence is ABSENT (the apply pass didn't run this cycle) quiescence is
// unproven, so this pass retires nothing — retirement is irreversible, and a missing
// apply signal must never be read as "the fleet is quiet".
//
// GitHub I/O is a single injected `gh(path, { method, body }) -> { status, json }`,
// supplied by the orchestrator over its GitHub MCP tools — there is NO REST client
// here and no token. Read-only toward every repo except the canon repo (its own),
// where it deletes retired records + their retireDeletesFromHome files.

import { existsSync, readFileSync } from 'node:fs';
import { retirableMigrations, MIGRATIONS_SUBDIR } from './registry.mjs';

const APPLIED_PATH = 'migrations-applied.json'; // legacy CI hand-off file; the orchestrator passes evidence in memory

// 200 -> present, 404 -> absent, anything else -> error (an indeterminate probe must
// count as pending, never "clean"). Inlined so the retire pass carries no dependency
// on the census's REST client.
async function fileExists(gh, fullName, path) {
  const { status } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status === 200) return true;
  if (status === 404) return false;
  throw new Error(`marker check ${fullName}:${path} returned ${status}`);
}

async function deleteFile(gh, canonRepo, path, message) {
  const head = await gh(`/repos/${canonRepo}/contents/${path}`);
  if (head.status !== 200 || !head.json?.sha) {
    throw new Error(`cannot resolve ${path} to delete (status ${head.status})`);
  }
  const res = await gh(`/repos/${canonRepo}/contents/${path}`, {
    method: 'DELETE',
    body: { message, sha: head.json.sha },
  });
  if (res.status !== 200) throw new Error(`deleting ${path} returned ${res.status}`);
}

// Like deleteFile but a 404 (already gone) is success, not an error — so a
// migration whose retirement removes several canon-repo files can be retried after a
// partial run without tripping on the ones already deleted.
async function deleteFileIfPresent(gh, canonRepo, path, message) {
  const head = await gh(`/repos/${canonRepo}/contents/${path}`);
  if (head.status === 404) return;
  if (head.status !== 200 || !head.json?.sha) {
    throw new Error(`cannot resolve ${path} to delete (status ${head.status})`);
  }
  const res = await gh(`/repos/${canonRepo}/contents/${path}`, {
    method: 'DELETE',
    body: { message, sha: head.json.sha },
  });
  if (res.status !== 200) throw new Error(`deleting ${path} returned ${res.status}`);
}

// Retire one fully-applied migration: delete any files it relocated into the
// consumers (retireDeletesFromHome) FIRST, then the record itself — so a partial
// failure leaves the record to retry the rest next cycle (each delete tolerates an
// already-gone 404). Both live in the canon repo the migrations were loaded from.
export async function retireMigration(gh, canonRepo, m) {
  const relocatedFiles = m.retireDeletesFromHome ?? [];
  for (const p of relocatedFiles) {
    await deleteFileIfPresent(gh, canonRepo, p, `Retire migration ${m.id}: remove ${p} — vendored into every consumer, unused in the canon`);
  }
  const record = `migrations/${MIGRATIONS_SUBDIR}/${m.file}`;
  await deleteFile(gh, canonRepo, record,
    `Retire migration ${m.id}: fully applied and quiet across the fleet (0 repos on the legacy shape, 0 applications this cycle)`);
  return `retired ${m.id} — deleted ${record}${relocatedFiles.length ? ` + ${relocatedFiles.length} canon file(s)` : ''}`;
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
export async function runRetirement(gh, canonRepo, migrations, covered, unknownCount, today, appliedThisCycle) {
  if (migrations.length === 0) return [];
  const lines = [];
  if (appliedThisCycle === null) {
    return ['no apply evidence from the apply pass this cycle — retiring nothing (quiescence unproven)'];
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
      lines.push(await retireMigration(gh, canonRepo, m));
    } catch (e) {
      lines.push(`could not auto-retire ${m.id}: ${e.message} — the maintenance session needs Contents write on ${canonRepo}`);
    }
  }
  return [...lines, ...notes];
}
