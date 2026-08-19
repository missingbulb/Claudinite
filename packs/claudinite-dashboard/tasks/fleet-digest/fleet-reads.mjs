// The cross-repo GitHub reads the digest's collector needs, and nothing more.
// Dependency-free (global fetch, Node 20+), and READ-ONLY: there is no write
// primitive here at all, because the digest writes exactly one file and writes it in
// this repo, through the engine's own delivery.
//
// WHY A SECOND COPY OF THIS. The claudinite-fleet-sheepdog pack keeps the same primitives at
// `packs/claudinite-fleet-sheepdog/fleet-api.mjs` for its own sweeps, and this is a deliberate
// duplicate of the four the digest uses rather than an import of them: a pack that
// imports another pack's module is a dependency between packs, and the two are
// adopted independently — an enforcer runs claudinite-fleet-sheepdog, and this pack is adopted by
// anyone who wants the page. The duplicated surface is a token-authenticated fetch, a
// pagination loop and a file read; it is the GitHub REST API's shape, not a decision
// either pack can drift on.
//
// It runs Action-side, as this task's code-work stage, under the fleet PAT — the account
// -spanning enumeration (`/user/repos`) a session-scoped connection structurally
// cannot make.

import { isDormant } from '../../../../engine/checks/helpers/repo-context.mjs';
import { forbiddenHint } from './fleet-token.mjs';

const API = 'https://api.github.com';

// The tracked declaration a member carries — read for its membership and its
// dormancy flag.
export const DECLARATION = '.claudinite-checks.json';

// Dormancy comes from the engine, never a private re-test: a member declares itself
// dormant and the test has to be the same one that member's own scheduler used to
// stop itself, or this brief would report repos that had already opted out.
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

// A failure the FLEET TOKEN'S GRANT explains — a read GitHub refused because the PAT
// lacks the scope, not because anything is wrong with the code. Tagged rather than
// described, because the tag survives being re-thrown and the wording does not: the
// worker's top-level catch prints the triage marker off `e.triage`, so the item parks
// at `task:needs-human-action` — a person adds a scope — instead of at `failure`,
// where it would wait for someone to read a stack trace that says nothing.
export function grantError(message) {
  const e = new Error(message);
  e.triage = 'action';
  return e;
}

// The worker's `main().catch(…)`. Prints the marker the executor routes on when the
// error carries a triage tag, then fails the run as before.
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
      // A 403 is a grant short one permission, not a broken endpoint: name which one,
      // or the run reports a bare status a hundred requests into a walk (#1030).
      throw (status === 401 || status === 403)
        ? grantError(`${why}${status === 403 ? forbiddenHint(path) : ' — the fleet PAT is unusable'}`)
        : new Error(why);
    }
    all.push(...json);
    if (json.length < 100) return all;
  }
}

// One file's text, or null when the repo has no such file.
export async function readFile(gh, fullName, path) {
  const res = await gh(`/repos/${fullName}/contents/${encodeURI(path)}`);
  if (res.status === 404) return null;
  if (res.status !== 200 || typeof res.json?.content !== 'string') {
    throw new Error(`${fullName}:${path} returned ${res.status}`
      + (res.status === 403 ? forbiddenHint(`/repos/${fullName}/contents/`) : ''));
  }
  return { text: Buffer.from(res.json.content, 'base64').toString('utf8'), sha: res.json.sha };
}

// One repo's parsed declaration, or null when it has none (uncovered). Anything
// else — an unreadable response, an unparsable body — THROWS, because a sweep that
// cannot read a member's declaration knows nothing about it, and "I could not read
// it" must never quietly become "it says nothing".
export async function readDeclaration(gh, fullName, path = DECLARATION) {
  const file = await readFile(gh, fullName, path);
  if (file === null) return null;
  try {
    return JSON.parse(file.text);
  } catch (e) {
    throw new Error(`unparsable ${path}: ${e.message}`);
  }
}
