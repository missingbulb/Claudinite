// Migration application — the fleet-wide APPLY pass (phase 1 of the daily
// maintenance routine, run BEFORE the pack tasks). Migrations-owned: basics
// baselining no longer carries the "apply migrations" step. See migrations/README.md
// and routines/auto-all-repos-maintenance.md.
//
// What it does: for every member the routine hands it, compute the member's pending
// migration writes — the same three write ops the local applier runs (file aliases,
// materialize, rewrite; registry.mjs) — against the member's target branch, and land
// the whole set as ONE commit. Templates are read from the canon checkout this runs
// in (the parent of migrations/); member reads/writes go through the injected `gh`.
// Idempotent: a member already on the canonical shape stages nothing and gets no
// commit.
//
// Delivery honors the member's `.claudinite-checks.json` `maintenance.delivery`
// (default `push`): `push` commits to the default branch; `pr` commits to the stable
// `claudinite/maintenance` branch and ensures its one open PR; anything else commits
// nothing and opens an issue naming it.
//
// GitHub I/O is a single injected `gh(path, { method, body }) -> { status, json }`,
// supplied by the orchestrator over its GitHub MCP tools — there is NO REST client
// here and no token. `applyToRepos` returns the migration ids it applied this cycle;
// the orchestrator hands that set to the retire pass as its quiescence evidence (a
// migration touched this cycle is never retired this cycle).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFileAliases, applyMaterializations, applyRewrites } from './registry.mjs';

const MAINT_BRANCH = 'claudinite/maintenance';
const canonRoot = dirname(dirname(fileURLToPath(import.meta.url))); // the checkout ships the templates
const readTemplate = (p) => (existsSync(join(canonRoot, p)) ? readFileSync(join(canonRoot, p), 'utf8') : null);

// A repo file's decoded content on `ref` (default branch when null), or null if absent.
async function getContent(gh, fullName, path, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const { status, json } = await gh(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}${q}`);
  if (status !== 200 || !json?.content) return null;
  return Buffer.from(json.content, 'base64').toString('utf8');
}

async function headSha(gh, fullName, branch) {
  // The ref path keeps its slashes (heads/a/b) — do NOT percent-encode the branch.
  const { status, json } = await gh(`/repos/${fullName}/git/ref/heads/${branch}`);
  if (status !== 200 || !json?.object?.sha) throw new Error(`no head for ${fullName}@${branch} (status ${status})`);
  return json.object.sha;
}

// The maintenance branch's head — creating it at the default branch's tip if absent.
async function ensureMaintBranch(gh, fullName, defaultBranch) {
  const existing = await gh(`/repos/${fullName}/git/ref/heads/${MAINT_BRANCH}`);
  if (existing.status === 200 && existing.json?.object?.sha) return existing.json.object.sha;
  const base = await headSha(gh, fullName, defaultBranch);
  const res = await gh(`/repos/${fullName}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${MAINT_BRANCH}`, sha: base } });
  if (res.status !== 201) throw new Error(`creating ${MAINT_BRANCH} on ${fullName} -> ${res.status}`);
  return base;
}

async function ensurePr(gh, fullName, defaultBranch) {
  const owner = fullName.split('/')[0];
  const open = await gh(`/repos/${fullName}/pulls?state=open&head=${owner}:${MAINT_BRANCH}`);
  if (open.status === 200 && Array.isArray(open.json) && open.json.length) return;
  await gh(`/repos/${fullName}/pulls`, {
    method: 'POST',
    body: {
      title: 'Claudinite maintenance', head: MAINT_BRANCH, base: defaultBranch,
      body: 'Automated Claudinite maintenance (migrations + baselining). Amended in place each run; never auto-merged.',
    },
  });
}

async function openDeliveryIssue(gh, fullName, value) {
  await gh(`/repos/${fullName}/issues`, {
    method: 'POST',
    body: {
      title: 'Claudinite maintenance: unrecognized delivery preference',
      body: `\`.claudinite-checks.json\` sets \`maintenance.delivery: "${value}"\`, which is neither \`push\` nor \`pr\`. `
        + 'Migrations were not applied this run. Set it to `push` or `pr`.',
    },
  });
}

// Stage a member's whole pending migration write-set in memory (against `ref`), so
// it commits as ONE commit. Staged-aware readers let a later op see an earlier op's
// write. Returns { files, deletes, ids } or null when nothing changed.
async function stageMemberWrites(gh, fullName, ref, migrations) {
  const files = new Map(); const deletes = new Set(); const ids = new Set();
  const read = async (p) => {
    if (files.has(p)) return files.get(p);
    if (deletes.has(p)) return null;
    return getContent(gh, fullName, p, ref);
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

// Land the staged set as one commit on `branch` (whose tip is `baseSha`) via the
// Git Data API: blobs -> tree (base_tree + deletions as sha:null) -> commit -> ref.
async function commitStaged(gh, fullName, branch, baseSha, staged, message) {
  const tree = [];
  for (const [path, content] of staged.files) {
    const blob = await gh(`/repos/${fullName}/git/blobs`, {
      method: 'POST', body: { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' },
    });
    if (blob.status !== 201) throw new Error(`blob ${path} -> ${blob.status}`);
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.json.sha });
  }
  for (const path of staged.deletes) tree.push({ path, mode: '100644', type: 'blob', sha: null });

  const baseCommit = await gh(`/repos/${fullName}/git/commits/${baseSha}`);
  const baseTree = baseCommit.json?.tree?.sha;
  if (!baseTree) throw new Error(`no base tree for ${fullName}@${baseSha}`);
  const treeRes = await gh(`/repos/${fullName}/git/trees`, { method: 'POST', body: { base_tree: baseTree, tree } });
  if (treeRes.status !== 201) throw new Error(`tree -> ${treeRes.status}`);
  const commitRes = await gh(`/repos/${fullName}/git/commits`, {
    method: 'POST', body: { message, tree: treeRes.json.sha, parents: [baseSha] },
  });
  if (commitRes.status !== 201) throw new Error(`commit -> ${commitRes.status}`);
  const refRes = await gh(`/repos/${fullName}/git/refs/heads/${branch}`, {
    method: 'PATCH', body: { sha: commitRes.json.sha },
  });
  if (refRes.status !== 200) throw new Error(`update ref ${branch} -> ${refRes.status}`);
}

// Apply pending migrations to one repo the routine handed us; returns the migration
// ids applied (empty when nothing was pending). Honors the repo's delivery preference.
export async function applyToRepo(gh, fullName, migrations) {
  const info = await gh(`/repos/${fullName}`);
  const defaultBranch = info.json?.default_branch;
  if (info.status !== 200 || !defaultBranch) return { ids: [], note: `${fullName}: unreadable (status ${info.status})` };
  const cfg = await getContent(gh, fullName, '.claudinite-checks.json', null);
  let delivery = 'push';
  try { delivery = JSON.parse(cfg ?? '{}')?.maintenance?.delivery ?? 'push'; } catch { delivery = 'push'; }

  if (delivery !== 'push' && delivery !== 'pr') {
    await openDeliveryIssue(gh, fullName, String(delivery));
    return { ids: [], note: `${fullName}: unrecognized delivery "${delivery}" — opened an issue, applied nothing` };
  }

  const branch = delivery === 'pr' ? MAINT_BRANCH : defaultBranch;
  const baseSha = delivery === 'pr' ? await ensureMaintBranch(gh, fullName, defaultBranch) : await headSha(gh, fullName, defaultBranch);
  const staged = await stageMemberWrites(gh, fullName, branch, migrations);
  if (!staged) return { ids: [] };

  await commitStaged(gh, fullName, branch, baseSha, staged, 'Apply Claudinite migrations');
  if (delivery === 'pr') await ensurePr(gh, fullName, defaultBranch);
  return { ids: [...staged.ids], note: `${fullName}: applied ${[...staged.ids].join(', ')} (${delivery})` };
}

// Apply pending migrations to every repo the routine handed us. A repo that throws is
// isolated — its error is noted and the rest still run. Returns the union of applied
// ids (this cycle's quiescence evidence) + notes. The orchestrator (which loads the
// migration set via registry.mjs and supplies the MCP-backed `gh`) calls this, then
// passes `appliedIds` straight to the retire pass — no intermediate file needed.
export async function applyToRepos(gh, fullNames, migrations) {
  const appliedIds = new Set(); const notes = [];
  for (const fullName of fullNames) {
    try {
      const { ids, note } = await applyToRepo(gh, fullName, migrations);
      ids.forEach((id) => appliedIds.add(id));
      if (note) notes.push(note);
    } catch (e) { notes.push(`${fullName}: apply failed (${e.message})`); }
  }
  return { appliedIds: [...appliedIds], notes };
}
