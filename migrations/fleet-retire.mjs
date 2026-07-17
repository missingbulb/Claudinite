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
//   io.ensureBranch(repo, branch, fromBranch)        (create_branch; idempotent)
//   io.remove(repo, branch, path, message) -> boolean (delete_file; tolerates absent)
//   io.hasOpenPr(repo, headBranch) -> boolean        (list_pull_requests)
//   io.openPr(repo, head, base, title, body)         (create_pull_request)
// Read-only toward every repo except the canon repo (its own). Retirement is NEVER
// pushed straight to the canon's default branch: an irreversible delete that strands
// an inline reference — a barriers `except` entry, a doc link, a test assertion — would
// break the canon's own CI, which is exactly how a past auto-retirement took `main` red
// (a 'sweep' can't fix it either: part of the footprint is test-file assertions no
// deterministic pass should rewrite). Instead the pass stages every delete on a stable
// retire branch and opens ONE PR (never auto-merged), so the canon's own checks — the
// same `barrier`, `reference-integrity`, and test suite — VALIDATE the retirement before
// it can land: a clean retirement is a green, mergeable PR; a stranding one is a red PR
// held for a human to clean the references it exposed. `main` never goes red from a
// retirement.

import { retirableMigrations, MIGRATIONS_SUBDIR } from './registry.mjs';

// Retirement is delivered like the apply pass's own writes — a stable branch + one open
// PR, never auto-merged — so the canon's CI gates the irreversible deletes.
const RETIRE_BRANCH = 'claudinite/retire-migrations';
const RETIRE_PR_BODY = [
  'Automated migration retirement, proposed by the fleet daily maintenance retire pass.',
  '',
  'Each retired migration deletes its record and the now-unused canon files it had',
  'vendored into the consumers. This is **irreversible**, so it is delivered as a PR',
  'rather than pushed to the default branch: the canon\'s own CI (barriers,',
  'reference-integrity, tests) validates that the deletion strands no inline reference',
  'before it can land. A green run is safe to merge; a red run means the retirement',
  'would break the canon — clean up the references it flags first. Never auto-merged;',
  'amended in place each run.',
].join('\n');

// Retire one fully-applied migration: stage the deletion of any files it relocated into
// the consumers (retireDeletesFromHome) FIRST, then the record itself — so a partial
// failure leaves the record to retry the rest next cycle (each delete tolerates an
// already-gone file). Staged onto `branch` (the retire branch, NOT the default branch),
// so the whole deletion rides one CI-gated PR rather than landing on the canon directly.
export async function retireMigration(io, canonRepo, branch, m) {
  const relocatedFiles = m.retireDeletesFromHome ?? [];
  for (const p of relocatedFiles) {
    await io.remove(canonRepo, branch, p, `Retire migration ${m.id}: remove ${p} — vendored into every consumer, unused in the canon`);
  }
  const record = `migrations/${MIGRATIONS_SUBDIR}/${m.file}`;
  await io.remove(canonRepo, branch, record,
    `Retire migration ${m.id}: fully applied and quiet across the fleet (0 repos on the legacy shape, 0 applications this cycle)`);
  return `staged retirement of ${m.id} on the retire PR — ${record}${relocatedFiles.length ? ` + ${relocatedFiles.length} canon file(s)` : ''}`;
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
    const defaultBranch = await io.getDefaultBranch(canonRepo);
    await io.ensureBranch(canonRepo, RETIRE_BRANCH, defaultBranch);
    let staged = false;
    for (const m of retirable) {
      try {
        lines.push(await retireMigration(io, canonRepo, RETIRE_BRANCH, m));
        staged = true;
      } catch (e) {
        lines.push(`could not stage retirement of ${m.id}: ${e.message} — the maintenance session needs Contents write on ${canonRepo}`);
      }
    }
    // One persistent PR, amended in place across runs and never auto-merged: the canon's
    // own CI decides whether the retirement is reference-safe to land.
    if (staged && !(await io.hasOpenPr(canonRepo, RETIRE_BRANCH))) {
      try {
        await io.openPr(canonRepo, RETIRE_BRANCH, defaultBranch, 'Claudinite: retire converged migrations', RETIRE_PR_BODY);
      } catch (e) {
        lines.push(`staged retirement on ${RETIRE_BRANCH} but could not open its PR: ${e.message}`);
      }
    }
  }
  return [...lines, ...notes];
}
