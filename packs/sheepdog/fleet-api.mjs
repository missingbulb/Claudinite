// The sheepdog census's cross-repo GitHub REST client. Dependency-free (global
// fetch, Node 20+). This is the ONE place a Claudinite process talks GitHub over
// raw REST with a token, and it is deliberately confined to the census — the
// account-spanning coverage audit that must enumerate EVERY repo the owner owns
// (`/user/repos`), which a session-scoped connection structurally cannot see. The
// census runs Action-side as the fleet-census task's preprocessing, with a
// fine-grained PAT; nothing in the daily-maintenance process imports this (that
// process is MCP-native and carries no REST client). It knows nothing about any
// specific pack: it is the generic "talk to many repos" layer, no more.

const API = 'https://api.github.com';

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

// Does this repo mount Claudinite? (Method B sync hook / legacy gitkeep / Method A
// submodule.) The structural "is this a covered member" test, shared by the planner
// (which repos to plan over) and the census (which repos are uncovered).
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
