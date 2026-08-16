// The GitHub read client. Browser-only, and deliberately the whole of the page's
// I/O — everything else in this tool is pure.
//
// ACCESS CONTROL IS THE VIEWER'S TOKEN, and there is nothing else. The page has no
// server, no backend and no shared credential: it calls api.github.com directly
// with a token the viewer pastes, so a repo they cannot read stays unreadable and
// no privilege exists here that they do not already hold. The token is kept in
// `localStorage` under this tool's own key and is sent to api.github.com and
// nowhere else.
//
// Every call is a READ. Nothing in this file writes to a repo.

const TOKEN_KEY = 'claudinite-tasks-dashboard:token';
const API = 'https://api.github.com';

export const readToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
};
export const writeToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

// Rate-limit headroom, read off the last response. Surfaced because this page can
// spend a hundred calls on a big repo and a viewer who runs out deserves to see
// why rather than a wall of failures.
export const rate = { remaining: null, limit: null, reset: null };

export class GitHubError extends Error {
  constructor(status, path, detail) {
    super(`GitHub ${status} on ${path}${detail ? ` — ${detail}` : ''}`);
    this.status = status;
    this.path = path;
  }
}

async function call(path, { token, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  rate.remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);
  rate.limit = Number(res.headers.get('x-ratelimit-limit') ?? NaN);
  rate.reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.message ?? ''; } catch { /* not json */ }
    throw new GitHubError(res.status, path, detail);
  }
  return raw ? res.text() : res.json();
}

export const getRepo = (repo, token) => call(`/repos/${repo}`, { token });

// A file's text. 404 is an ANSWER here, not a failure: an unadopted repo has no
// `.claudinite-checks.json` and a task may declare no worker, and both are things
// the page reports rather than crashes on.
export async function getText(repo, path, ref, token) {
  try {
    return await call(`/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, { token, raw: true });
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Every blob path at `ref`, in ONE call. The alternative — walking `contents/` per
// directory — is a call per pack per task and the first thing to exhaust the rate
// limit on a repo with a full mount.
export async function listTree(repo, ref, token) {
  const t = await call(`/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, { token });
  return {
    paths: (t.tree ?? []).filter((n) => n.type === 'blob').map((n) => n.path),
    // The tree API silently caps at 100k entries; a truncated listing means the
    // roster may be missing tasks, which the page must say rather than imply
    // completeness it does not have.
    truncated: Boolean(t.truncated),
  };
}

// Issues, newest first, up to a page budget. The list API and never the search
// index: search is eventually consistent, which is how a just-created item goes
// missing from a view whose whole job is to show what is happening right now.
//
// The budget is REPORTED alongside the results. A repo with thousands of issues
// will not be fully scanned, and a dashboard that quietly truncated its own history
// would read as "this task never ran".
export async function listIssues(repo, token, { pages = 5, perPage = 100, onPage = () => {} } = {}) {
  const out = [];
  let scanned = 0;
  let complete = false;
  for (let page = 1; page <= pages; page += 1) {
    const batch = await call(
      `/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=${perPage}&page=${page}`,
      { token },
    );
    if (!Array.isArray(batch) || batch.length === 0) { complete = true; break; }
    for (const i of batch) {
      if (i.pull_request) continue;   // the issues endpoint returns PRs too
      scanned += 1;
      out.push(i);
    }
    onPage(page, scanned);
    if (batch.length < perPage) { complete = true; break; }
  }
  return { issues: out, scanned, complete };
}

export const listComments = (repo, number, token) =>
  call(`/repos/${repo}/issues/${number}/comments?per_page=100`, { token });

export const listRuns = (repo, token, perPage = 40) =>
  call(`/repos/${repo}/actions/runs?per_page=${perPage}`, { token })
    .then((r) => r.workflow_runs ?? []);
