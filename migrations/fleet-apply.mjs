// Migration application — the fleet-wide APPLY pass (phase 1 of the daily
// maintenance routine, run BEFORE the pack tasks). Migrations-owned: basics
// baselining no longer carries the "apply migrations" step. See migrations/README.md
// and routines/auto-all-repos-maintenance.md.
//
// What it does: for every member the routine hands it, compute the member's pending
// migration writes — the same three write ops the local applier runs (file aliases,
// materialize, rewrite; registry.mjs) — against the member's target branch and land
// them. Templates are read from the canon checkout this runs in (the parent of
// migrations/); member reads/writes go through the injected `io` (below). Idempotent:
// a member already on the canonical shape stages nothing and gets no commit.
//
// Delivery honors the member's `.claudinite-checks.json` `maintenance.delivery`
// (default `push`): `push` commits to the default branch; `pr` commits to the stable
// `claudinite/maintenance` branch and ensures its one open PR; anything else commits
// nothing and opens an issue naming it.
//
// GitHub I/O is a small injected `io` object whose methods map 1:1 to the GitHub MCP
// tools the orchestrator drives — there is NO REST client here and no token:
//   io.getDefaultBranch(repo)                 -> string | null   (get repo)
//   io.read(repo, path[, ref])                -> string | null   (get_file_contents)
//   io.ensureBranch(repo, branch, fromBranch)                    (create_branch; idempotent)
//   io.commit(repo, branch, files, message)                      (push_files — files:[{path,content}])
//   io.remove(repo, branch, path, message)    -> boolean         (delete_file; tolerates absent)
//   io.hasOpenPr(repo, headBranch)            -> boolean         (list_pull_requests)
//   io.openPr(repo, head, base, title, body)                     (create_pull_request)
//   io.openIssue(repo, title, body)                              (issue_write create)
// The writes land as one `commit` (push_files); a rare file-move's delete follows via
// `remove` (a separate commit — MCP has no atomic multi-file+delete, and no active
// migration produces a delete). `applyToRepos` returns the migration ids it applied
// this cycle; the orchestrator hands that set to the retire pass as its quiescence
// evidence (a migration touched this cycle is never retired this cycle).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFileAliases, applyMaterializations, applyRewrites } from './registry.mjs';

const MAINT_BRANCH = 'claudinite/maintenance';
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // the checkout ships the templates
const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);

// Stage a member's whole pending migration write-set in memory (reading `branch`),
// so it commits as ONE commit. Staged-aware readers let a later op see an earlier
// op's write. Returns { files, deletes, ids } or null when nothing changed.
async function stageMemberWrites(io, fullName, branch, migrations) {
  const files = new Map(); const deletes = new Set(); const ids = new Set();
  const read = async (p) => {
    if (files.has(p)) return files.get(p);
    if (deletes.has(p)) return null;
    return io.read(fullName, p, branch);
  };
  const exists = async (p) => (await read(p)) !== null;
  const write = (p, c) => { files.set(p, c); deletes.delete(p); };
  const move = async (from, to) => {
    const content = await read(from);
    if (content == null) return;
    files.set(to, content); files.delete(from); deletes.add(from);
  };
  for (const m of migrations) {
    const a = await applyFileAliases(m, { exists, move });
    const mat = await applyMaterializations(m, { readTemplate, read, write });
    const rw = await applyRewrites(m, { read, write });
    if (a.length || mat.length || rw.length) ids.add(m.id);
  }
  return (files.size || deletes.size) ? { files, deletes, ids } : null;
}

// Apply pending migrations to one repo the routine handed us; returns the migration
// ids applied (empty when nothing was pending). Honors the repo's delivery preference.
export async function applyToRepo(io, fullName, migrations) {
  const defaultBranch = await io.getDefaultBranch(fullName);
  if (!defaultBranch) return { ids: [], note: `${fullName}: unreadable` };
  const cfg = await io.read(fullName, '.claudinite-checks.json');
  let delivery = 'push';
  try { delivery = JSON.parse(cfg ?? '{}')?.maintenance?.delivery ?? 'push'; } catch { delivery = 'push'; }

  if (delivery !== 'push' && delivery !== 'pr') {
    await io.openIssue(
      fullName,
      'Claudinite maintenance: unrecognized delivery preference',
      `\`.claudinite-checks.json\` sets \`maintenance.delivery: "${delivery}"\`, which is neither \`push\` nor \`pr\`. `
        + 'Migrations were not applied this run. Set it to `push` or `pr`.',
    );
    return { ids: [], note: `${fullName}: unrecognized delivery "${delivery}" — opened an issue, applied nothing` };
  }

  const branch = delivery === 'pr' ? MAINT_BRANCH : defaultBranch;
  if (delivery === 'pr') await io.ensureBranch(fullName, MAINT_BRANCH, defaultBranch);

  const staged = await stageMemberWrites(io, fullName, branch, migrations);
  if (!staged) return { ids: [] };

  const files = [...staged.files].map(([path, content]) => ({ path, content }));
  if (files.length) await io.commit(fullName, branch, files, 'Apply Claudinite migrations');
  for (const path of staged.deletes) {
    await io.remove(fullName, branch, path, `Apply Claudinite migrations: remove ${path}`);
  }
  if (delivery === 'pr' && !(await io.hasOpenPr(fullName, MAINT_BRANCH))) {
    await io.openPr(
      fullName, MAINT_BRANCH, defaultBranch, 'Claudinite maintenance',
      'Automated Claudinite maintenance (migrations + baselining). Amended in place each run; never auto-merged.',
    );
  }
  return { ids: [...staged.ids], note: `${fullName}: applied ${[...staged.ids].join(', ')} (${delivery})` };
}

// Apply pending migrations to every repo the routine handed us. A repo that throws is
// isolated — its error is noted and the rest still run. Returns the union of applied
// ids (this cycle's quiescence evidence) + notes. The orchestrator (which loads the
// migration set via registry.mjs and supplies the MCP-backed `io`) calls this, then
// passes `appliedIds` straight to the retire pass — no intermediate file needed.
export async function applyToRepos(io, fullNames, migrations) {
  const appliedIds = new Set(); const notes = [];
  for (const fullName of fullNames) {
    try {
      const { ids, note } = await applyToRepo(io, fullName, migrations);
      ids.forEach((id) => appliedIds.add(id));
      if (note) notes.push(note);
    } catch (e) { notes.push(`${fullName}: apply failed (${e.message})`); }
  }
  return { appliedIds: [...appliedIds], notes };
}
