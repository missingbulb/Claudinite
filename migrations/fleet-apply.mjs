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
// (default `auto`; `push`/`pr` are permanent aliases for `auto`/`review`). BOTH modes
// land on the stable `claudinite/maintenance` branch and its one open PR — never a
// direct commit to the default branch: `review` leaves that PR for the owner; `auto`
// arms GitHub auto-merge on it, so it lands automatically once the repo's checks pass
// (no run ever blocks on CI). Anything else commits nothing and opens an issue naming it.
//
// Both lanes regenerate, never reconcile (#332): the desired end-state is
// always computed against the DEFAULT branch (the truth being migrated), never
// the maintenance branch's own stale copy; writes the branch already carries are
// dropped so quiet nights add no commits; and each run first refreshes the
// branch from base (io.updateBranchFromBase, optional — a conflict is noted for
// the owner, never resolved here) so a weeks-open PR doesn't merge stale-based
// content.
//
// GitHub I/O is a small injected `io` object whose methods map 1:1 to the GitHub MCP
// tools the orchestrator drives — there is NO REST client here and no token:
//   io.getDefaultBranch(repo)                 -> string | null   (get repo)
//   io.read(repo, path[, ref])                -> string | null   (get_file_contents)
//   io.ensureBranch(repo, branch, fromBranch)                    (create_branch; idempotent)
//   io.commit(repo, branch, files, message)                      (push_files — files:[{path,content}])
//   io.remove(repo, branch, path, message)    -> boolean         (delete_file; tolerates absent)
//   io.hasOpenPr(repo, headBranch)            -> boolean         (list_pull_requests)
//   io.openPr(repo, head, base, title, body)  -> prNumber        (create_pull_request)
//   io.enableAutoMerge(repo, prNumber)                           (enable_pr_auto_merge —
//                                                arms native auto-merge; the `auto` lane's
//                                                land-once-checks-pass, never blocking)
//   io.openIssue(repo, title, body)                              (issue_write create)
//   io.updateBranchFromBase(repo, headBranch)  [optional]        (update_pull_request_branch
//                                                on its open PR; throws on conflict)
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
  let rawDelivery = 'auto';
  try { rawDelivery = JSON.parse(cfg ?? '{}')?.maintenance?.delivery ?? 'auto'; } catch { rawDelivery = 'auto'; }
  // `push`/`pr` are the pre-rename aliases for `auto`/`review` — accepted permanently
  // (the maintenance-delivery-rename migration rewrites the stored value, but the
  // tolerance outlives the record, so retiring it strands nothing).
  const delivery = rawDelivery === 'push' ? 'auto' : rawDelivery === 'pr' ? 'review' : rawDelivery;

  if (delivery !== 'auto' && delivery !== 'review') {
    await io.openIssue(
      fullName,
      'Claudinite maintenance: unrecognized delivery preference',
      `\`.claudinite-checks.json\` sets \`maintenance.delivery: "${rawDelivery}"\`, which is neither \`auto\` nor \`review\`. `
        + 'Migrations were not applied this run. Set it to `auto` or `review`.',
    );
    return { ids: [], note: `${fullName}: unrecognized delivery "${rawDelivery}" — opened an issue, applied nothing` };
  }

  // Both deliveries land on the stable `claudinite/maintenance` branch and its one
  // PR — never a direct commit to the default branch. `review` leaves that PR for the
  // owner; `auto` arms GitHub auto-merge on it, so it lands automatically
  // once the repo's checks pass (the run never blocks on CI). How strictly "once
  // checks pass" holds depends on the repo requiring its checks (branch protection);
  // with none required, GitHub lands the PR as soon as it's mergeable.
  const notes = [];

  // Desired end-state is ALWAYS computed against the default branch — the truth
  // being migrated — never the maintenance branch's own copy (#332).
  const staged = await stageMemberWrites(io, fullName, defaultBranch, migrations);
  if (!staged) return { ids: [], note: undefined };

  await io.ensureBranch(fullName, MAINT_BRANCH, defaultBranch);
  // Refresh the branch from base before the diff below and the eventual merge, so a
  // long-open PR isn't merged stale-based (#332). A conflict is the owner's to see,
  // never resolved here.
  if (io.updateBranchFromBase && (await io.hasOpenPr(fullName, MAINT_BRANCH))) {
    try { await io.updateBranchFromBase(fullName, MAINT_BRANCH); }
    catch (e) { notes.push(`maintenance branch could not update from base: ${e.message}`); }
  }

  // Drop writes the branch already carries, so an unmerged PR doesn't collect an
  // identical commit every night.
  let files = [...staged.files].map(([path, content]) => ({ path, content }));
  let deletes = [...staged.deletes];
  const pending = [];
  for (const f of files) {
    if ((await io.read(fullName, f.path, MAINT_BRANCH)) !== f.content) pending.push(f);
  }
  files = pending;
  const pendingDeletes = [];
  for (const path of deletes) {
    if ((await io.read(fullName, path, MAINT_BRANCH)) !== null) pendingDeletes.push(path);
  }
  deletes = pendingDeletes;
  if (!files.length && !deletes.length) {
    return { ids: [], note: notes.length ? `${fullName}: ${notes.join('; ')}` : undefined };
  }

  if (files.length) await io.commit(fullName, MAINT_BRANCH, files, 'Apply Claudinite migrations');
  for (const path of deletes) {
    await io.remove(fullName, MAINT_BRANCH, path, `Apply Claudinite migrations: remove ${path}`);
  }
  if (!(await io.hasOpenPr(fullName, MAINT_BRANCH))) {
    const prNumber = await io.openPr(
      fullName, MAINT_BRANCH, defaultBranch, 'Claudinite maintenance',
      delivery === 'auto'
        ? 'Automated Claudinite maintenance (migrations + baselining). Amended in place each run; auto-merges once this repo\'s checks pass.'
        : 'Automated Claudinite maintenance (migrations + baselining). Amended in place each run; left for your review.',
    );
    if (delivery === 'auto') {
      // Arm GitHub's native auto-merge (non-blocking): the run never waits for CI.
      // If the repo hasn't enabled auto-merge, the PR simply stays open for review.
      try { await io.enableAutoMerge(fullName, prNumber); }
      catch (e) { notes.push(`auto-merge could not be armed (PR left for review): ${e.message}`); }
    }
  }
  notes.unshift(`applied ${[...staged.ids].join(', ')} (${delivery})`);
  return { ids: [...staged.ids], note: `${fullName}: ${notes.join('; ')}` };
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
