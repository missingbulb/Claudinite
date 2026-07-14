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
// If that evidence is ABSENT (`null` — the apply pass didn't run this cycle)
// quiescence is unproven, so this pass retires nothing — retirement is irreversible,
// and a missing apply signal must never be read as "the fleet is quiet".
//
// GitHub I/O is the same small injected `io` object the apply pass takes (each method
// a GitHub MCP tool) — there is NO REST client here and no token:
//   io.read(repo, path)          -> string | null   (get_file_contents; 404 -> null)
//   io.getDefaultBranch(repo)    -> string | null   (get repo)
//   io.remove(repo, branch, path, message) -> boolean (delete_file; tolerates absent)
// Read-only toward every repo except the canon repo (its own), where it deletes
// retired records + their retireDeletesFromHome files (on its default branch).

import { retirableMigrations, MIGRATIONS_SUBDIR } from './registry.mjs';

// Retire one fully-applied migration: delete any files it relocated into the
// consumers (retireDeletesFromHome) FIRST, then the record itself — so a partial
// failure leaves the record to retry the rest next cycle (each delete tolerates an
// already-gone file). Both live in the canon repo (`branch` = its default branch).
export async function retireMigration(io, canonRepo, branch, m) {
  const relocatedFiles = m.retireDeletesFromHome ?? [];
  for (const p of relocatedFiles) {
    await io.remove(canonRepo, branch, p, `Retire migration ${m.id}: remove ${p} — vendored into every consumer, unused in the canon`);
  }
  const record = `migrations/${MIGRATIONS_SUBDIR}/${m.file}`;
  await io.remove(canonRepo, branch, record,
    `Retire migration ${m.id}: fully applied and quiet across the fleet (0 repos on the legacy shape, 0 applications this cycle)`);
  return `retired ${m.id} — deleted ${record}${relocatedFiles.length ? ` + ${relocatedFiles.length} canon file(s)` : ''}`;
}

// Probe every covered repo for each migration's legacy shape, then retire the ones
// the fleet has left behind AND the apply pass left untouched this cycle. A probe
// error counts as pending (never "clean"), so an API hiccup only ever delays a
// retirement, never triggers a premature one. `appliedThisCycle` is the Set of ids
// the apply pass applied this run (passed in memory), or `null` when apply didn't run.
export async function runRetirement(io, canonRepo, migrations, covered, unknownCount, today, appliedThisCycle) {
  if (migrations.length === 0) return [];
  if (appliedThisCycle === null) {
    return ['no apply evidence from the apply pass this cycle — retiring nothing (quiescence unproven)'];
  }
  const lines = [];
  const notes = [];
  const pending = new Map(migrations.map((m) => [m.id, 0]));
  for (const fullName of covered) {
    const exists = async (path) => (await io.read(fullName, path)) !== null;
    const read = (path) => io.read(fullName, path);
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
  const retirable = retirableMigrations(migrations, { pending, unknownCount, today, appliedThisCycle });
  if (retirable.length) {
    const branch = await io.getDefaultBranch(canonRepo);
    for (const m of retirable) {
      try {
        lines.push(await retireMigration(io, canonRepo, branch, m));
      } catch (e) {
        lines.push(`could not auto-retire ${m.id}: ${e.message} — the maintenance session needs Contents write on ${canonRepo}`);
      }
    }
  }
  return [...lines, ...notes];
}
