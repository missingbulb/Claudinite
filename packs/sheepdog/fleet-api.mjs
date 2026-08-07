// The sheepdog census's cross-repo GitHub REST client. Dependency-free (global
// fetch, Node 20+). This is the ONE place a Claudinite process talks GitHub over
// raw REST with a token, and it is deliberately confined to the census — the
// account-spanning coverage audit that must enumerate EVERY repo the owner owns
// (`/user/repos`), which a session-scoped connection structurally cannot see. The
// census runs Action-side as the fleet-census task's preprocessing, with a
// fine-grained PAT; nothing in the daily-maintenance process imports this (that
// process is MCP-native and carries no REST client). It knows nothing about any
// specific pack: it is the generic "talk to many repos" layer, no more.
//
// It is READ-ONLY toward members but for ONE primitive — `putFile`, which the
// preferences sweep uses to land the fleet's preferences-store declaration in a
// member. Keeping the write to a single named function is deliberate: "what can
// this module change in someone else's repo" then has exactly one answer to read.

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

export async function paged(gh, path) {
  const sep = path.includes('?') ? '&' : '?';
  const all = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`${path}${sep}per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(json)) {
      throw new Error(`GET ${path} page ${page} failed with status ${status}`);
    }
    all.push(...json);
    if (json.length < 100) return all;
  }
}

// --- the enforcer repo's own issue surface -----------------------------------
// Both sweeps this pack runs (coverage and freshness) converge a labelled issue
// per finding IN THE ENFORCER REPO. The label ensure and the labelled-issue read
// are identical between them — only the open/close POLICY differs, and that stays
// in each sweep, where its semantics are legible. These two are the shared floor.

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
    throw new Error(`writing ${fullName}:${path} returned ${status} — the fleet PAT needs Contents WRITE on this repo (${json?.message ?? 'no message'})`);
  }
  throw new Error(`writing ${fullName}:${path} returned ${status} (${json?.message ?? 'no message'})`);
}

// Does this repo mount Claudinite? (Method B sync hook / legacy gitkeep / Method A
// submodule.) The structural "is this a covered member" test — the existence-only
// probe for callers that need nothing from inside the file. The census itself now
// reads the declaration (readDeclaration) instead, because its roster names dormant
// members and dormancy lives inside the file; the membership rule is the same.
export async function isCovered(gh, fullName) {
  // The tracked declaration file is THE membership signal — the one file every
  // member carries whatever its mount shape (the engine can't run without it,
  // and baselining backfills it nightly), and the only shape the planner can
  // plan for at all (activePacks is read from it). A mount marker WITHOUT a
  // declaration is a half-adoption that must classify as uncovered — the census
  // then opens an adoption issue and it heals loudly, instead of rotting as a
  // "covered" repo no task ever runs on. (vendoring/DESIGN.md)
  return fileExists(gh, fullName, '.claudinite-checks.json');
}
