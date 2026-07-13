#!/usr/bin/env node
// Migration application — the fleet-wide APPLY pass (phase 1 of the daily
// maintenance routine, run BEFORE the pack tasks). Its own fleet walk,
// migrations-owned: basics baselining no longer carries the "apply migrations"
// step. See migrations/README.md and routines/auto-all-repos-maintenance.md.
//
// What it does: for every covered member, compute its pending migration writes —
// the same three write ops the local applier runs (file aliases, materialize,
// rewrite; registry.mjs) — against the member's target branch, and land the whole
// set as ONE commit via the Git Data API. Templates are read from the canon
// checkout this runs in (the parent of migrations/); dest reads/writes hit the
// member over the API. Idempotent: a member already on the canonical shape stages
// nothing and gets no commit.
//
// Delivery honors the member's `.claudinite-checks.json` `maintenance.delivery`
// (default `push`): `push` commits to the default branch; `pr` commits to the
// stable `claudinite/maintenance` branch and ensures its one open PR; anything
// else commits nothing and opens an issue naming it (the baselining delivery
// contract, unchanged).
//
// It writes `migrations-applied.json` — the ids it wrote to >=1 repo this cycle —
// which the retire pass (phase 3) reads to enforce the quiescence guard: a
// migration touched this cycle is never retired this cycle.
//
// Dependency-free (global fetch, Node 20+). Needs FLEET_GITHUB_TOKEN with Contents
// write across the fleet.

import { appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadMigrations, applyFileAliases, applyMaterializations, applyRewrites } from './registry.mjs';
import { makeGh, paged, isCovered } from '../routines/fleet/fleet-api.mjs';

const APPLIED_PATH = 'migrations-applied.json';
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

// Apply pending migrations to one member; returns the migration ids applied (empty
// when nothing was pending). Honors the member's delivery preference.
export async function applyToMember(gh, repo, migrations) {
  const fullName = repo.full_name;
  const defaultBranch = repo.default_branch;
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

// Walk the covered fleet and apply pending migrations to each; return the union of
// applied ids (this cycle's apply evidence) plus per-repo notes. A member that
// throws is isolated — its error is noted and the rest still run.
export async function applyAcrossFleet(gh, home, owner, migrations) {
  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  const appliedIds = new Set(); const notes = [];
  for (const r of mine.sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    if (r.full_name.toLowerCase() === home.toLowerCase() || r.archived || r.fork) continue;
    try {
      if (!(await isCovered(gh, r.full_name))) continue;
    } catch (e) { notes.push(`${r.full_name}: coverage probe errored (${e.message}) — skipped`); continue; }
    try {
      const { ids, note } = await applyToMember(gh, r, migrations);
      ids.forEach((id) => appliedIds.add(id));
      if (note) notes.push(note);
    } catch (e) { notes.push(`${r.full_name}: apply failed (${e.message})`); }
  }
  return { appliedIds: [...appliedIds], notes };
}

async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) throw new Error('FLEET_GITHUB_TOKEN is not set — the apply pass walks the whole account.');
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);
  const owner = home.split('/')[0].toLowerCase();
  const migrations = await loadMigrations();

  const { appliedIds, notes } = await applyAcrossFleet(gh, home, owner, migrations);
  // The apply evidence the retire pass reads for its quiescence guard — always
  // written (even empty), so its presence proves the apply pass ran this cycle.
  writeFileSync(APPLIED_PATH, `${JSON.stringify(appliedIds, null, 2)}\n`);

  const summary = ['# Migration application', '',
    `**Applied this cycle:** ${appliedIds.length ? appliedIds.join(', ') : 'none (fleet already converged)'}`,
    ...notes.map((n) => `- ${n}`)].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`migration application failed: ${e.message}`); process.exit(1); });
}
