// canon-curation task: migrations-retire — the fleet-wide migration RETIRE pass,
// as an agentless scheduler task (per-project-scheduling DESIGN §6, table 2). This
// task is `agent_model: 'none'` with `agent_preprocessing: 'node worker.mjs'`, so
// the scheduler runs THIS FILE as a subprocess (cwd = this task dir) bounded by
// `agent_preprocessing_timeout` — no agent, no dispatch issue.
//
// What it does (ports migrations/fleet-retire.mjs into the per-repo scheduler):
// over every covered member, probe each migration's `legacyPresent`, and stage the
// retirement of any migration the WHOLE fleet has left behind AND has demonstrably
// converged past. Retirement is IRREVERSIBLE (it deletes the record + the canon
// files the migration vendored out), so it is delivered as ONE never-auto-merged
// PR: the canon's own CI (barriers, reference-integrity, tests) validates that the
// deletion strands no inline reference before it can land — a clean retirement is a
// green mergeable PR, a stranding one a red PR held for a human. `main` never goes
// red from a retirement, and an imperfect quiescence call at worst opens a
// reviewable PR, never a destructive direct delete.
//
// Quiescence in the per-repo model: the old central pass proved it with an
// in-memory `appliedThisCycle` handoff from the same run's apply pass. Here there
// is no central apply pass — each member's baselining applies notes and advances
// its own provenance stamp — so quiescence is PER-REPO: retire only when every
// member's stamp is dated strictly after the migration landed (it has converged
// past it, so it isn't mid-application). The guard is `retirableMigrationsByStamp`
// (migrations/registry.mjs), unit-tested there; this worker only feeds it evidence.
//
// This runs ONLY on the canon repo (canon-curation is canon-home-only, never
// vendored), so it reaches the canon's own migrations/ + engine/ tree by DYNAMIC
// import from CLAUDINITE_REPO_ROOT — the honest mechanism for a subprocess whose
// cwd is the task dir, and legitimate here because canon-curation already shares
// the home checkout's engine (its accepted file-placement reach). Cross-repo reads
// use FLEET_GITHUB_TOKEN; the canon PR is written over the Action's GITHUB_TOKEN
// (widened to contents+pull-requests write for scheduler delivery, #416).

import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const RETIRE_BRANCH = 'claudinite/retire-migrations';
const RETIRE_PR_TITLE = 'Claudinite: retire converged migrations';
const RETIRE_PR_BODY = [
  'Automated migration retirement, proposed by the per-repo scheduler\'s retire task.',
  '',
  'Each retired migration deletes its record and the now-unused canon files it had',
  'vendored into the consumers. This is **irreversible**, so it is delivered as a PR',
  'rather than pushed to the default branch: the canon\'s own CI (barriers,',
  'reference-integrity, tests) validates that the deletion strands no inline reference',
  'before it can land. A green run is safe to merge; a red run means the retirement',
  'would break the canon — clean up the references it flags first. Never auto-merged.',
].join('\n');

// --- decision core (pure over injected evidence — the testable heart) ---------

// Assess retirement from the fleet + a `probe(member, migration) -> Promise<bool>`
// (the member's legacyPresent, which may throw). Returns the evidence the
// stamp-based guard needs plus a human summary. A member with no provenance stamp,
// or one that readFleet couldn't read at all (`fleet.unreadable`), makes the fleet
// picture incomplete — counted into `unknownCount`, which blocks ALL retirement (a
// member we can't place could still be on a legacy shape). A per-migration probe
// error counts that member as still-legacy for THAT migration only (pending++),
// exactly as the old pass did — an API hiccup delays a retirement, never triggers
// one.
export async function assessRetirement({ migrations, fleet, today, probe, retirableByStamp }) {
  const notes = [];
  let unknownCount = (fleet.unreadable ?? []).length;
  for (const r of fleet.unreadable ?? []) notes.push(`${r}: declaration unreadable this run — counted unknown (blocks all retirement)`);

  const memberStampDates = [];
  const pending = new Map(migrations.map((m) => [m.id, 0]));
  for (const member of fleet.members) {
    const stampDate = member.stamp?.updated;
    if (!stampDate) {
      unknownCount += 1;
      notes.push(`${member.repo}: no provenance stamp — can't prove it converged past any migration (counted unknown)`);
    } else {
      memberStampDates.push(stampDate);
    }
    for (const m of migrations) {
      let stillLegacy;
      try {
        stillLegacy = await probe(member, m);
      } catch (e) {
        stillLegacy = true;
        notes.push(`${m.id}: legacyPresent probe on ${member.repo} errored (${e.message}) — counted pending`);
      }
      if (stillLegacy) pending.set(m.id, pending.get(m.id) + 1);
    }
  }

  const lines = migrations.map((m) => `${m.id} — ${pending.get(m.id)} member(s) still on the legacy shape`);
  const retirable = retirableByStamp(migrations, { pending, unknownCount, today, memberStampDates });
  return { pending, unknownCount, memberStampDates, retirable, lines, notes };
}

// --- I/O shell ----------------------------------------------------------------

// A minimal REST client over a token. `gh(path) -> { status, json }`.
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

// A member-scoped `(exists, read)` pair over the fleet PAT, for a migration's
// legacyPresent(exists, read). `read` returns the file's decoded text or null
// (404); `exists` is read !== null. A non-200/404 read throws, so a transient
// failure surfaces as a probe error (counted pending), never a false "absent".
function memberProbes(fleetGh, fullName, branch) {
  const read = async (path) => {
    const { status, json } = await fleetGh(`/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (status === 404) return null;
    if (status !== 200 || !json?.content) throw new Error(`read ${fullName}:${path} returned ${status}`);
    return Buffer.from(json.content, 'base64').toString('utf8');
  };
  const exists = async (path) => (await read(path)) !== null;
  return { exists, read };
}

// Stage the deletion of one retired migration onto the retire branch (never the
// default branch): its relocated canon files first (retireDeletesFromHome), then
// the record — so a partial failure leaves the record to retry next cycle. Each
// delete tolerates an already-gone file (404 → skip).
async function stageRetirement(canonGh, canonRepo, branch, m, migrationsSubdir) {
  const del = async (path, message) => {
    const cur = await canonGh(`/repos/${canonRepo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (cur.status === 404) return; // already gone
    if (cur.status !== 200 || !cur.json?.sha) throw new Error(`could not read ${path} to delete (status ${cur.status})`);
    const res = await canonGh(`/repos/${canonRepo}/contents/${path}`, {
      method: 'DELETE', body: { message, sha: cur.json.sha, branch },
    });
    if (res.status >= 300) throw new Error(`deleting ${path} returned ${res.status}`);
  };
  for (const p of m.retireDeletesFromHome ?? []) {
    await del(p, `Retire migration ${m.id}: remove ${p} — vendored into every consumer, unused in the canon`);
  }
  await del(`migrations/${migrationsSubdir}/${m.file}`,
    `Retire migration ${m.id}: fully applied and quiet across the fleet (0 members on the legacy shape, all converged past it)`);
  return `staged retirement of ${m.id}`;
}

export async function main() {
  const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
  const canonRepo = process.env.CLAUDINITE_REPO || process.env.GITHUB_REPOSITORY;
  const defaultBranch = process.env.CLAUDINITE_DEFAULT_BRANCH || 'main';
  const slotId = process.env.CLAUDINITE_SLOT_ID || '';
  const today = new Date().toISOString().slice(0, 10);
  const log = (s) => console.log(`migrations-retire${slotId ? ` [${slotId}]` : ''}: ${s}`);

  if (!canonRepo) { console.error('migrations-retire: no repo in env'); process.exit(1); }
  if (!process.env.FLEET_GITHUB_TOKEN) {
    // Retirement is OPTIONAL cleanup; without the fleet PAT it simply can't enumerate
    // the fleet to prove quiescence. Log loudly and no-op (exit 0) rather than escalate.
    log('FLEET_GITHUB_TOKEN not set — cannot enumerate the fleet to prove quiescence; retiring nothing this run.');
    return;
  }

  // Reach the canon's own tree (this task runs only on the canon): the migrations
  // registry (loadMigrations + the stamp guard) and the fleet reader.
  const registry = await import(pathToFileURL(join(root, 'migrations/registry.mjs')).href);
  const { readFleet } = await import(pathToFileURL(join(root, 'engine/scheduler/signals/fleet.mjs')).href);
  const { MIGRATIONS_SUBDIR } = await import(pathToFileURL(join(root, 'engine/checks/helpers/active-migrations.mjs')).href);

  const migrations = await registry.loadMigrations();
  if (!migrations.length) { log('no active migrations — nothing to retire.'); return; }

  const fleetGh = makeGh(process.env.FLEET_GITHUB_TOKEN);
  const fleet = await readFleet(fleetGh, {
    owner: canonRepo.split('/')[0], canonRepo, sinceIso: today, // retire ignores the window; sinceIso is unused by the stamp/probe path
  });
  if (fleet.error) { log(`fleet enumeration failed — ${fleet.error}; retiring nothing.`); return; }

  const probe = (member, m) => {
    const { exists, read } = memberProbes(fleetGh, member.repo, member.defaultBranch);
    return m.legacyPresent(exists, read);
  };
  const { retirable, lines, notes } = await assessRetirement({
    migrations, fleet, today, probe, retirableByStamp: registry.retirableMigrationsByStamp,
  });

  for (const l of lines) log(l);
  for (const n of notes) log(n);

  if (!retirable.length) { log('nothing retirable this run (fleet not proven converged-and-quiet).'); return; }

  // Deliver: stage every retirable migration on ONE retire branch and open ONE
  // never-auto-merged PR (amended in place across runs) — the canon's CI gates it.
  const canonGh = makeGh(process.env.GITHUB_TOKEN);
  // ensure the retire branch off the default branch head (idempotent)
  const head = await canonGh(`/repos/${canonRepo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  if (head.status !== 200 || !head.json?.object?.sha) { console.error(`migrations-retire: cannot read ${defaultBranch} head (${head.status})`); process.exit(1); }
  const mk = await canonGh(`/repos/${canonRepo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${RETIRE_BRANCH}`, sha: head.json.object.sha } });
  if (mk.status >= 300 && mk.status !== 422) { console.error(`migrations-retire: cannot create ${RETIRE_BRANCH} (${mk.status})`); process.exit(1); } // 422 = already exists

  let staged = false;
  for (const m of retirable) {
    try { log(await stageRetirement(canonGh, canonRepo, RETIRE_BRANCH, m, MIGRATIONS_SUBDIR)); staged = true; }
    catch (e) { log(`could not stage retirement of ${m.id}: ${e.message}`); }
  }

  if (staged) {
    const open = await canonGh(`/repos/${canonRepo}/pulls?state=open&head=${canonRepo.split('/')[0]}:${RETIRE_BRANCH}`);
    const hasOpen = open.status === 200 && Array.isArray(open.json) && open.json.length > 0;
    if (!hasOpen) {
      const pr = await canonGh(`/repos/${canonRepo}/pulls`, {
        method: 'POST', body: { title: RETIRE_PR_TITLE, head: RETIRE_BRANCH, base: defaultBranch, body: RETIRE_PR_BODY },
      });
      if (pr.status >= 300) log(`staged retirement on ${RETIRE_BRANCH} but could not open its PR (${pr.status})`);
      else log(`opened retire PR #${pr.json?.number} — the canon's CI now gates the deletion.`);
    } else {
      log(`retire PR already open on ${RETIRE_BRANCH} — amended in place.`);
    }
  }
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on
// import — so a test can import { assessRetirement } without any live GitHub.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
