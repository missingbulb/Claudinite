// The sheepdog sweeps' cross-repo GitHub REST client. Dependency-free (global
// fetch, Node 20+). This is the ONE place a Claudinite process talks GitHub over
// raw REST with a token, and it is deliberately confined to the sweeps — the
// account-spanning audits that must enumerate EVERY repo the owner owns
// (`/user/repos`), which a session-scoped connection structurally cannot see. They run
// Action-side as their tasks' preprocessing, with a
// fine-grained PAT; nothing in the daily-maintenance process imports this (that
// process is MCP-native and carries no REST client). It knows nothing about any
// specific pack: it is the generic "talk to many repos" layer, no more.
//
// It is READ-ONLY toward members but for ONE primitive — `putFile`, which the
// pack-seed sweep uses to land a declaration this fleet wants in every member.
// Keeping the write to a single named function is deliberate: "what can this module
// change in someone else's repo" then has exactly one answer to read.

import { isDormant } from '../../engine/checks/helpers/repo-context.mjs';

const API = 'https://api.github.com';

// The tracked declaration every member carries — the file the sweeps read a member's
// membership, stamp and dormancy out of. Named once here because all three sweeps
// name it.
export const DECLARATION = '.claudinite-checks.json';

// Dormancy, re-exported from the engine rather than re-tested here. A member declares
// itself dormant in its OWN declaration, and the test has to be the same one that
// member's scheduler used to stop itself — a sweep with its own private notion of
// dormancy would nag exactly the repos that had already opted out, which is the whole
// failure this exists to prevent.
export { isDormant };


export function makeGh(token) {
  return async function gh(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, json };
  };
}

// A failure the FLEET TOKEN'S GRANT explains — a read or a write GitHub refused
// because the PAT lacks the scope, not because anything is wrong with the code.
// Tagged rather than described, because the tag survives being re-thrown and the
// wording does not: a worker's top-level catch prints the triage marker off
// `e.triage` (`fleetWorkerFailed`), so the item parks at
// `task:needs-human-action` — a person adds a scope — instead of at `failure`,
// where it would wait for someone to read a stack trace that says nothing.
export function grantError(message) {
  const e = new Error(message);
  e.triage = 'action';
  return e;
}

// Every worker's `main().catch(…)`. Prints the marker the executor routes on when
// the error carries a triage tag, then fails the run as before.
export function fleetWorkerFailed(name, e) {
  console.error(`${name} failed: ${e.message}`);
  if (e?.triage) console.error(`claudinite-needs-human: ${e.triage} — ${e.message}`);
  process.exit(1);
}

export async function paged(gh, path) {
  const sep = path.includes('?') ? '&' : '?';
  const all = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`${path}${sep}per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(json)) {
      const why = `GET ${path} page ${page} failed with status ${status}`;
      throw (status === 401 || status === 403)
        ? grantError(`${why} — the fleet PAT is unusable or lacks the scope this read needs`)
        : new Error(why);
    }
    all.push(...json);
    if (json.length < 100) return all;
  }
}

// --- the enforcer repo's own issue surface -----------------------------------
// Both issue families the roster sweep converges (coverage and freshness) file a
// labelled issue per finding IN THE ENFORCER REPO. The label ensure and the
// labelled-issue read are identical between them — only the open/close POLICY
// differs, and that stays in each family's module, where its semantics are legible.
// These two are the shared floor.

// Idempotent: 422 is "already exists", which is the state we wanted.
export async function ensureLabel(gh, repo, name, { color, description }) {
  const { status } = await gh(`/repos/${repo}/labels`, { method: 'POST', body: { name, color, description } });
  if (status !== 201 && status !== 422) throw new Error(`creating label ${name} returned ${status}`);
}

// Every issue ever carrying the label, open and closed, PRs filtered out — a
// sweep needs the closed ones to tell "converged" from "never opened", and to
// honour a close the owner made deliberately.
export async function labeledIssues(gh, repo, label) {
  const all = (await paged(gh, `/repos/${repo}/issues?labels=${label}&state=all`)).filter((i) => !i.pull_request);
  return { open: all.filter((i) => i.state === 'open'), closed: all.filter((i) => i.state === 'closed') };
}

// 200 → true, 404 → false, anything else → error (the caller decides what an
// indeterminate result means).
export async function fileExists(gh, fullName, path) {
  const { status } = await gh(`/repos/${fullName}/contents/${path}`);
  if (status === 200) return true;
  if (status === 404) return false;
  throw new Error(`marker check ${fullName}:${path} returned ${status}`);
}

// One file's text and its blob sha, or null when the repo has no such file. The sha
// is what a later write passes back as its precondition (see putFile), so reading and
// writing a file is one read here and one write there — never a second read that could
// see a different commit.
export async function readFile(gh, fullName, path) {
  const res = await gh(`/repos/${fullName}/contents/${encodeURI(path)}`);
  if (res.status === 404) return null;
  if (res.status !== 200 || typeof res.json?.content !== 'string') throw new Error(`${fullName}:${path} returned ${res.status}`);
  return { text: Buffer.from(res.json.content, 'base64').toString('utf8'), sha: res.json.sha };
}

// One repo's parsed declaration, or null when it has none (uncovered). Anything
// else — an unreadable response, an unparsable body — THROWS, because a sweep that
// cannot read a member's declaration knows nothing about it, and "I could not read
// it" must never quietly become "it says nothing". Shared by the sweeps that need
// what is INSIDE the file (the stamp, the dormancy flag) rather than only that it
// exists. `withFile` returns `{ config, text, sha }` instead — the parsed settings, the
// exact bytes, and the write precondition, all from the ONE response, for a sweep that
// goes on to write the file back: a second read could see a different commit.
export async function readDeclaration(gh, fullName, path = DECLARATION, { withFile = false } = {}) {
  const file = await readFile(gh, fullName, path);
  if (file === null) return null;
  let config;
  try {
    config = JSON.parse(file.text);
  } catch (e) {
    throw new Error(`unparsable ${path}: ${e.message}`);
  }
  return withFile ? { config, text: file.text, sha: file.sha } : config;
}

// Write one file back to a repo's default branch, guarded by the sha the read
// returned: a 409 means the file moved under us, so the caller's decision was made
// against content that no longer exists and this run simply does not write it (the
// next run re-reads and decides again). The ONE write primitive that touches another
// repo — every other call in this module reads.
export async function putFile(gh, fullName, { path, text, sha, message }) {
  const { status, json } = await gh(`/repos/${fullName}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: { message, content: Buffer.from(text, 'utf8').toString('base64'), ...(sha ? { sha } : {}) },
  });
  if (status === 200 || status === 201) return json?.commit?.sha ?? null;
  if (status === 409) throw new Error(`${fullName}:${path} changed under the sweep (409) — not written this run`);
  if (status === 403 || status === 404) {
    throw grantError(`writing ${fullName}:${path} returned ${status} — the fleet PAT needs Contents WRITE on this repo (${json?.message ?? 'no message'})`);
  }
  throw new Error(`writing ${fullName}:${path} returned ${status} (${json?.message ?? 'no message'})`);
}

// Does this repo mount Claudinite? (Method B sync hook / legacy gitkeep / Method A
// submodule.) The structural "is this a covered member" test — the existence-only
// probe for callers that need nothing from inside the file. The roster walk itself
// reads the declaration (readDeclaration) instead, because it names dormant members
// and dormancy lives inside the file; the membership rule is the same.
export async function isCovered(gh, fullName) {
  // The tracked declaration file is THE membership signal — the one file every
  // member carries whatever its mount shape (the engine can't run without it,
  // and baselining backfills it nightly), and the only shape the planner can
  // plan for at all (activePacks is read from it). A mount marker WITHOUT a
  // declaration is a half-adoption that must classify as uncovered — the roster
  // then opens an adoption issue and it heals loudly, instead of rotting as a
  // "covered" repo no task ever runs on. (vendoring/DESIGN.md)
  return fileExists(gh, fullName, '.claudinite-checks.json');
}

// --- firing a member's own scheduler -------------------------------------------

// The member-side workflow every fan-out fires, and the shape of the firing. Two of
// this pack's tasks press this button — fleet-baseline (each member baselines itself)
// and fleet-add-missing-packs (each member adopts the packs its work-list issue names)
// — so the primitive lives here on the shared floor rather than in either task. The
// fan-out model is the point (#749): the enforcer DISPATCHES, the member EXECUTES —
// every agentic step happens inside the member, under its own scheduler, executor and
// grant, so no agent anywhere needs cross-repo access. The one credential is the PAT,
// and the one scope beyond the read-only sweeps' is Actions WRITE (a workflow_dispatch
// POST is an Actions write).
export const SCHEDULER = 'claudinite-scheduler.yml';

// Fire one member's scheduler at ONE task id. Under the work-item queue, forcing a
// scheduled task is WAKING ITS STANDING ITEM (tasks-dispatch DESIGN §8) — an issue
// edit, not an override bag — and the `wake` input is how this repo asks for that
// without touching the member's issues itself: the member's own tick does the wake,
// with the member's own token, and the drain that follows runs it. Keeping the write
// on the member's side is what holds this pack's fleet PAT at Actions write; the
// enforcer editing issues across the fleet would need issue write on every repository.
//
// `ref` is the member's DEFAULT branch (read from the enumeration, never assumed to
// be `main`): workflow_dispatch resolves the workflow file on the ref it is given,
// and a repo whose trunk is `master` would otherwise 404 as if it carried no
// scheduler at all.
export async function fireScheduler(gh, fullName, ref, taskId) {
  const { status } = await gh(`/repos/${fullName}/actions/workflows/${SCHEDULER}/dispatches`, {
    method: 'POST',
    body: { ref, inputs: { wake: taskId } },
  });
  return classifyDispatch(status);
}

// What the dispatch POST's status means. Every branch is a DIFFERENT thing for the
// reader to do, which is why callers report a state per repo instead of a count of
// failures: a 404 is a repo to adopt, a 403 is a token to re-scope, a 422 is a
// workflow GitHub has switched off. Kept free of I/O so the whole table is testable.
export function classifyDispatch(status) {
  switch (status) {
    case 204:
      return { state: 'fired', detail: 'queued on its own scheduler' };
    case 404:
      // The workflow is missing, the repo has Actions disabled, or the PAT cannot see
      // the repo at all — indistinguishable from here, and all three mean "nothing was
      // queued".
      return { state: 'no-scheduler', detail: `no ${SCHEDULER} on the default branch, or Actions is disabled — nothing there can run its own tasks` };
    case 403:
      return { state: 'no-permission', detail: 'the PAT lacks Actions: write on this repo — dispatching a workflow is an Actions write, a scope the read-only sweeps never needed' };
    case 422:
      // Two unrelated causes share this status, and the fix is opposite in each, so
      // the message names both rather than guessing. GitHub disables a repo's
      // scheduled workflows after 60 days of inactivity and a disabled workflow
      // refuses dispatch — that one is a repo to nudge. The other is a member whose
      // scheduler workflow predates the `wake` input: GitHub rejects a dispatch
      // naming an input the workflow does not declare, so the member is behind on
      // its mount, NOT misconfigured, and it heals on its own next converge. Saying
      // only "disabled" sent a reader to the repo's settings for a stale checkout.
      return { state: 'not-dispatchable', detail: 'the workflow exists but refused the dispatch (422) — either its scheduler workflow predates the `wake` input, which its next converge lands, or GitHub has disabled it (cron is switched off on inactive repos)' };
    default:
      return { state: 'error', detail: `dispatch returned ${status}` };
  }
}
