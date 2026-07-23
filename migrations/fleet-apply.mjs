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
// land on the run's dated maintenance branch and its one open PR — never a
// direct commit to the default branch: `review` leaves that PR for the owner; `auto`
// arms GitHub auto-merge on it, so it lands automatically once the repo's checks pass
// (no run ever blocks on CI). Anything else commits nothing and opens an issue naming it.
//
// Per-run delivery branch (not a single stable branch): each maintenance CYCLE gets a
// freshly-named `claudinite/maintenance-<date>-<seed>` branch (date + random seed), so
// the delivery branch is unique per cycle. Idempotency is by PREFIX, not an exact name:
// a run reuses the current cycle's already-open maintenance PR/branch when one exists
// (found by the `claudinite/maintenance` head prefix — the seed makes an exact-name
// lookup impossible), and only mints a fresh dated branch + its own PR when none is
// open. The orchestrator generates the run's branch name once and hands it in
// (`opts.branch`) so this pass and the baselining worker land on ONE branch per run.
//
// Both lanes regenerate, never reconcile (#332): the desired end-state is
// always computed against the DEFAULT branch (the truth being migrated), never
// the delivery branch's own stale copy; writes the branch already carries are
// dropped so quiet nights add no commits; and when reusing an already-open cycle's
// branch it is first refreshed from base (io.updateBranchFromBase, optional — a
// conflict is noted for the owner, never resolved here) so a weeks-open PR doesn't
// merge stale-based content.
//
// GitHub I/O is a small injected `io` object whose methods map 1:1 to the GitHub MCP
// tools the orchestrator drives — there is NO REST client here and no token:
//   io.getDefaultBranch(repo)                 -> string | null   (get repo)
//   io.read(repo, path[, ref])                -> string | null   (get_file_contents)
//   io.ensureBranch(repo, branch, fromBranch)                    (create_branch; idempotent)
//   io.commit(repo, branch, files, message)                      (push_files — files:[{path,content}])
//   io.remove(repo, branch, path, message)    -> boolean         (delete_file; tolerates absent)
//   io.findOpenPrByPrefix(repo, headPrefix)   -> string | null   (list_pull_requests, open;
//                                                the head branch of the first open PR whose
//                                                head starts with the prefix, else null)
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

// The common head prefix every maintenance delivery branch shares. The full name
// carries a per-cycle date + random seed (maintenanceBranchName below); the prefix
// is what the dedupe lookup and the tidy sweep's ignore match on.
const MAINT_PREFIX = 'claudinite/maintenance';
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // the checkout ships the templates
const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);

// A freshly-named delivery branch for a new maintenance cycle: the date plus a random
// seed, so each cycle's branch is distinct (the single stable branch is retired).
// Callers normally pass the run's shared name via `opts.branch` so a run's migrations
// and its baselining converge on ONE branch; this is the fallback when none is handed.
const pad2 = (n) => String(n).padStart(2, '0');
export function maintenanceBranchName() {
  const d = new Date();
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const seed = Math.random().toString(36).slice(2, 8);
  return `${MAINT_PREFIX}-${date}-${seed}`;
}

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
// `opts.branch` is the run's maintenance branch name (the orchestrator generates it
// once and shares it with baselining); it is used only when this repo has no open
// maintenance PR to reuse. Absent, a fresh dated branch is minted per repo.
export async function applyToRepo(io, fullName, migrations, opts = {}) {
  const defaultBranch = await io.getDefaultBranch(fullName);
  if (!defaultBranch) return { ids: [], note: `${fullName}: unreadable` };
  const cfg = await io.read(fullName, '.claudinite-checks.json');
  let rawDelivery = 'auto-merge';
  try { rawDelivery = JSON.parse(cfg ?? '{}')?.maintenance?.delivery ?? 'auto-merge'; } catch { rawDelivery = 'auto-merge'; }
  // `push`/`pr` are the pre-rename aliases for `auto`/`review` — accepted permanently
  // (the maintenance-delivery-rename migration rewrites the stored value, but the
  // tolerance outlives the record, so retiring it strands nothing).
  const delivery = rawDelivery === 'push' || rawDelivery === 'auto' ? 'auto-merge' : rawDelivery === 'pr' ? 'review' : rawDelivery;

  if (delivery !== 'auto-merge' && delivery !== 'review') {
    await io.openIssue(
      fullName,
      'Claudinite maintenance: unrecognized delivery preference',
      `\`.claudinite-checks.json\` sets \`maintenance.delivery: "${rawDelivery}"\`, which is neither \`auto-merge\` nor \`review\`. `
        + 'Migrations were not applied this run. Set it to `auto` or `review`.',
    );
    return { ids: [], note: `${fullName}: unrecognized delivery "${rawDelivery}" — opened an issue, applied nothing` };
  }

  // Both deliveries land on the run's dated maintenance branch and its one
  // PR — never a direct commit to the default branch. `review` leaves that PR for the
  // owner; `auto` arms GitHub auto-merge on it, so it lands automatically
  // once the repo's checks pass (the run never blocks on CI). How strictly "once
  // checks pass" holds depends on the repo requiring its checks (branch protection);
  // with none required, GitHub lands the PR as soon as it's mergeable.
  const notes = [];

  // Desired end-state is ALWAYS computed against the default branch — the truth
  // being migrated — never the delivery branch's own copy (#332).
  const staged = await stageMemberWrites(io, fullName, defaultBranch, migrations);
  if (!staged) return { ids: [], note: undefined };

  // Dedupe by PREFIX, not an exact name: the delivery branch carries a per-cycle
  // random seed, so the open maintenance PR can't be found by a fixed name. Reuse the
  // current cycle's open PR/branch when one exists; otherwise mint a fresh dated
  // branch — the run's shared name (opts.branch) when the orchestrator handed one, so
  // migrations and baselining land on ONE branch, else a per-repo fresh name.
  const openHead = io.findOpenPrByPrefix ? await io.findOpenPrByPrefix(fullName, MAINT_PREFIX) : null;
  const branch = openHead ?? opts.branch ?? maintenanceBranchName();

  await io.ensureBranch(fullName, branch, defaultBranch);
  // When reusing an already-open cycle's branch, refresh it from base before the diff
  // below and the eventual merge, so a long-open PR isn't merged stale-based (#332). A
  // conflict is the owner's to see, never resolved here. A freshly-minted branch is
  // already at base, so this only runs for a reused branch.
  if (openHead && io.updateBranchFromBase) {
    try { await io.updateBranchFromBase(fullName, branch); }
    catch (e) { notes.push(`maintenance branch could not update from base: ${e.message}`); }
  }

  // Drop writes the branch already carries, so an unmerged (reused) PR doesn't collect
  // an identical commit every night. A freshly-minted branch carries none, so all
  // staged writes are pending.
  let files = [...staged.files].map(([path, content]) => ({ path, content }));
  let deletes = [...staged.deletes];
  const pending = [];
  for (const f of files) {
    if ((await io.read(fullName, f.path, branch)) !== f.content) pending.push(f);
  }
  files = pending;
  const pendingDeletes = [];
  for (const path of deletes) {
    if ((await io.read(fullName, path, branch)) !== null) pendingDeletes.push(path);
  }
  deletes = pendingDeletes;
  if (!files.length && !deletes.length) {
    return { ids: [], note: notes.length ? `${fullName}: ${notes.join('; ')}` : undefined };
  }

  if (files.length) await io.commit(fullName, branch, files, 'Apply Claudinite migrations');
  for (const path of deletes) {
    await io.remove(fullName, branch, path, `Apply Claudinite migrations: remove ${path}`);
  }
  // Open a PR only when this run minted a fresh cycle branch; a reused branch already
  // has its open PR (that's how we found it).
  if (!openHead) {
    const prNumber = await io.openPr(
      fullName, branch, defaultBranch, 'Claudinite maintenance',
      delivery === 'auto-merge'
        ? 'Automated Claudinite maintenance (migrations + baselining). One dated branch per cycle; auto-merges once this repo\'s checks pass.'
        : 'Automated Claudinite maintenance (migrations + baselining). One dated branch per cycle; left for your review.',
    );
    if (delivery === 'auto-merge') {
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
// `opts.branch` (optional) is the run's shared maintenance branch name the orchestrator
// generated once — used for any repo with no open maintenance PR to reuse, so a run's
// migrations and baselining share one delivery branch. Absent, each repo mints its own.
export async function applyToRepos(io, fullNames, migrations, opts = {}) {
  const appliedIds = new Set(); const notes = [];
  for (const fullName of fullNames) {
    try {
      const { ids, note } = await applyToRepo(io, fullName, migrations, opts);
      ids.forEach((id) => appliedIds.add(id));
      if (note) notes.push(note);
    } catch (e) { notes.push(`${fullName}: apply failed (${e.message})`); }
  }
  return { appliedIds: [...appliedIds], notes };
}
