// canon-curation task: migrations-retire — the migration TTL ARCHIVER, as an
// agentless scheduler task (per-project-scheduling redesign). This task is
// `agent_model: 'none'` with `agent_preprocessing: 'node worker.mjs'`, so the
// scheduler runs THIS FILE as a subprocess (cwd = this task dir) bounded by
// `agent_preprocessing_timeout` — no agent, no dispatch issue.
//
// What it does: move every migration record whose age has passed the TTL (7 days
// since `landed`) from `migrations/active_migrations/` to the canon-only
// `migrations/migrations-old/` archive, delivered as ONE PR. This is HOUSEKEEPING,
// not deletion: an archived record still APPLIES (loadMigrations loads both folders,
// so a dormant project baselining out of a fresh canon clone still backfills it) —
// it just stops shipping in the mount and stops tolerating its legacy shape in the
// checks (every up-to-date repo converged within the TTL). No fleet status, no fleet
// PAT: the decision is a pure age comparison over the canon's own records.
//
// This runs ONLY on the canon repo (canon-curation is canon-home-only, never
// vendored), so it reaches the canon's own migrations/ tree by DYNAMIC import from
// CLAUDINITE_REPO_ROOT — the honest mechanism for a subprocess whose cwd is the task
// dir. The move is written over the Action's GITHUB_TOKEN (the one sanctioned
// non-MCP surface for scheduler code; widened to contents+pull-requests write for
// scheduler delivery). The selection logic is `migrationsPastTtl`
// (migrations/registry.mjs), unit-tested there; this worker only performs the move.

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const TTL_DAYS = 7;
const ARCHIVE_BRANCH = 'claudinite/archive-migrations';
const ARCHIVE_PR_TITLE = 'Claudinite: archive migrations past their TTL';
const ARCHIVE_PR_BODY = [
  'Automated migration archival, proposed by the scheduler\'s `migrations-retire` (TTL) task.',
  '',
  `Each record below has passed its ${TTL_DAYS}-day TTL, so it moves from`,
  '`migrations/active_migrations/` to the canon-only `migrations/migrations-old/` archive.',
  '',
  '**This is not a deletion.** An archived record still applies — `loadMigrations` reads',
  'both folders, so a dormant project baselining out of a fresh canon clone still backfills',
  'it. It just stops shipping in the vendored mount and stops tolerating its legacy shape',
  'in the checks (every up-to-date repo converged within the TTL). Safe to merge once green.',
].join('\n');

// A minimal Actions-REST client over the injected GITHUB_TOKEN. `gh(path) -> { status, json }`.
function makeGh(token, api = process.env.GITHUB_API_URL || 'https://api.github.com') {
  return async function gh(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'claudinite-scheduler',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  };
}

// Move one record from active_migrations/ to migrations-old/ on `branch`: read its
// blob (content + sha), create it at the archive path, then delete the original.
// Order matters — create first, so a partial failure never loses the record.
async function archiveRecord(gh, repo, branch, activeSubdir, oldSubdir, file) {
  const from = `migrations/${activeSubdir}/${file}`;
  const to = `migrations/${oldSubdir}/${file}`;
  const cur = await gh(`/repos/${repo}/contents/${from}?ref=${encodeURIComponent(branch)}`);
  if (cur.status === 404) return `~ ${file}: already gone from ${activeSubdir} — skipped`;
  if (cur.status !== 200 || !cur.json?.sha || cur.json?.content == null) throw new Error(`reading ${from} returned ${cur.status}`);
  const put = await gh(`/repos/${repo}/contents/${to}`, {
    method: 'PUT',
    body: { message: `Archive migration ${file}: past its ${TTL_DAYS}-day TTL — moves to migrations-old (still applies, no longer ships)`, content: cur.json.content, branch },
  });
  if (put.status >= 300) throw new Error(`creating ${to} returned ${put.status}`);
  const del = await gh(`/repos/${repo}/contents/${from}`, {
    method: 'DELETE',
    body: { message: `Archive migration ${file}: remove from active_migrations (archived to migrations-old)`, sha: cur.json.sha, branch },
  });
  if (del.status >= 300) throw new Error(`deleting ${from} returned ${del.status}`);
  return `→ ${file}: active_migrations → migrations-old`;
}

export async function main() {
  const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
  const repo = process.env.CLAUDINITE_REPO || process.env.GITHUB_REPOSITORY;
  const defaultBranch = process.env.CLAUDINITE_DEFAULT_BRANCH || 'main';
  const slotId = process.env.CLAUDINITE_SLOT_ID || '';
  const today = new Date().toISOString().slice(0, 10);
  const log = (s) => console.log(`migrations-retire${slotId ? ` [${slotId}]` : ''}: ${s}`);

  if (!repo) { console.error('migrations-retire: no repo in env'); process.exit(1); }
  if (!process.env.GITHUB_TOKEN) { console.error('migrations-retire: no GITHUB_TOKEN in env'); process.exit(1); }

  // Reach the canon's own migrations registry (this task runs only on the canon).
  const { loadMigrations, migrationsPastTtl, MIGRATIONS_SUBDIR, MIGRATIONS_OLD_SUBDIR } =
    await import(pathToFileURL(join(root, 'migrations/registry.mjs')).href);

  const aged = migrationsPastTtl(await loadMigrations(), { today, ttlDays: TTL_DAYS });
  if (!aged.length) { log(`no migrations past the ${TTL_DAYS}-day TTL — nothing to archive.`); return; }
  log(`${aged.length} migration(s) past the ${TTL_DAYS}-day TTL: ${aged.map((m) => m.file).join(', ')}`);

  const gh = makeGh(process.env.GITHUB_TOKEN);
  // Ensure the archive branch off the default-branch head (idempotent — 422 = exists).
  const head = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  if (head.status !== 200 || !head.json?.object?.sha) { console.error(`migrations-retire: cannot read ${defaultBranch} head (${head.status})`); process.exit(1); }
  const mk = await gh(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${ARCHIVE_BRANCH}`, sha: head.json.object.sha } });
  if (mk.status >= 300 && mk.status !== 422) { console.error(`migrations-retire: cannot create ${ARCHIVE_BRANCH} (${mk.status})`); process.exit(1); }

  let moved = false;
  for (const m of aged) {
    try { log(await archiveRecord(gh, repo, ARCHIVE_BRANCH, MIGRATIONS_SUBDIR, MIGRATIONS_OLD_SUBDIR, m.file)); moved = true; }
    catch (e) { log(`could not archive ${m.file}: ${e.message}`); }
  }

  if (moved) {
    const open = await gh(`/repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${ARCHIVE_BRANCH}`);
    const hasOpen = open.status === 200 && Array.isArray(open.json) && open.json.length > 0;
    if (!hasOpen) {
      const pr = await gh(`/repos/${repo}/pulls`, { method: 'POST', body: { title: ARCHIVE_PR_TITLE, head: ARCHIVE_BRANCH, base: defaultBranch, body: ARCHIVE_PR_BODY } });
      if (pr.status >= 300) log(`archived on ${ARCHIVE_BRANCH} but could not open its PR (${pr.status})`);
      else log(`opened archive PR #${pr.json?.number}.`);
    } else {
      log(`archive PR already open on ${ARCHIVE_BRANCH} — amended in place.`);
    }
  }
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
