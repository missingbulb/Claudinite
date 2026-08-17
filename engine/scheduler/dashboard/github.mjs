// The GitHub read client, and the only I/O in the dashboard. Every call is a READ;
// nothing here writes to a repo.
//
// ACCESS CONTROL IS THE VIEWER'S CREDENTIAL and there is nothing else — no backend,
// no shared token, no service account. Whichever provider `auth.mjs` used, the page
// calls api.github.com as that person, so a repo they cannot read stays unreadable
// and this page grants no access anyone did not already have.
//
// Caching is not an optimisation here, it is what makes a fleet view viable: see
// `cache.mjs` for why the three strategies differ. The rate-limit accounting below
// distinguishes calls that SPENT budget from 304s that did not, because "how much
// did that cost" is the question a viewer asks when a fleet sweep feels slow.

import { immutable, validated, ageing, projectIssue, projectRun, DAY_MS } from './cache.mjs';

const API = 'https://api.github.com';

export const rate = { remaining: null, limit: null, reset: null, spent: 0, revalidated: 0, served: 0 };

export const resetCounters = () => { rate.spent = 0; rate.revalidated = 0; rate.served = 0; };

export class GitHubError extends Error {
  constructor(status, path, detail) {
    super(`GitHub ${status} on ${path}${detail ? ` — ${detail}` : ''}`);
    this.status = status;
    this.path = path;
  }
}

// An ABSENT rate-limit header means "this response did not say", which is not zero.
// `Number(null)` is 0 and passes `isFinite`, so reading the header straight through
// makes any response without one report a budget of zero — the last such response
// wins and the page claims the viewer is rate-limited when they are not.
const headerNumber = (res, name) => {
  const raw = res.headers.get(name);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

function noteRate(res) {
  const r = headerNumber(res, 'x-ratelimit-remaining');
  if (r !== null) rate.remaining = r;
  const l = headerNumber(res, 'x-ratelimit-limit');
  if (l !== null) rate.limit = l;
  const t = headerNumber(res, 'x-ratelimit-reset');
  if (t !== null) rate.reset = t;
}

async function raw(path, { token, accept = 'application/vnd.github+json', etag = null } = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(etag ? { 'If-None-Match': etag } : {}),
    },
  });
  noteRate(res);
  return res;
}

async function fail(res, path) {
  let detail = '';
  try { detail = (await res.json())?.message ?? ''; } catch { /* not json */ }
  return new GitHubError(res.status, path, detail);
}

// A call whose result is live: cached with its ETag and revalidated every time. A
// 304 costs no rate-limit budget, so this is free freshness — never stale data.
async function conditional(path, token, { transform = (x) => x } = {}) {
  const hit = validated.get(path);
  const res = await raw(path, { token, etag: hit?.etag });
  if (res.status === 304 && hit) {
    rate.revalidated += 1;
    validated.touch(path);
    return hit.data;
  }
  rate.spent += 1;
  if (!res.ok) throw await fail(res, path);
  const data = transform(await res.json());
  validated.set(path, res.headers.get('etag'), data);
  return data;
}

export const getRepo = (repo, token) =>
  conditional(`/repos/${repo}`, token, {
    transform: (r) => ({ default_branch: r.default_branch, private: r.private, full_name: r.full_name }),
  });

// The head commit of the default branch — the cache key everything immutable hangs
// off. One cheap call buys the right to skip every content read when nothing landed.
export const getHeadSha = (repo, branch, token) =>
  conditional(`/repos/${repo}/commits/${encodeURIComponent(branch)}`, token, {
    transform: (c) => c.sha,
  });

// A file's text AT A SHA, therefore immutable and cached forever. This is where the
// bulk of a repeat load's savings come from: a roster of task declarations is one
// call each on a cold cache and zero on a warm one.
//
// 404 is an ANSWER, not a failure — an unadopted repo has no declaration file — and
// it is cached as such, so a fleet sweep does not re-ask every member every time.
export async function getTextAtSha(repo, sha, path, token) {
  const hit = immutable.get(repo, sha, path);
  if (hit !== undefined) { rate.served += 1; return hit; }

  const res = await raw(`/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(sha)}`,
    { token, accept: 'application/vnd.github.raw' });
  rate.spent += 1;
  if (res.status === 404) { immutable.set(repo, sha, path, null); return null; }
  if (!res.ok) throw await fail(res, path);
  const text = await res.text();
  immutable.set(repo, sha, path, text);
  return text;
}

// The tree at a sha — immutable for the same reason, and the single most expensive
// response the page fetches on a large repo.
export async function listTreeAtSha(repo, sha, token) {
  const hit = immutable.get(repo, sha, '::tree');
  if (hit !== undefined && hit !== null) { rate.served += 1; return hit; }

  const res = await raw(`/repos/${repo}/git/trees/${encodeURIComponent(sha)}?recursive=1`, { token });
  rate.spent += 1;
  if (!res.ok) throw await fail(res, `/repos/${repo}/git/trees`);
  const t = await res.json();
  const out = {
    paths: (t.tree ?? []).filter((n) => n.type === 'blob').map((n) => n.path),
    // The tree API caps at 100k entries; a truncated listing means the roster may be
    // missing tasks, which the page states rather than quietly implying completeness.
    truncated: Boolean(t.truncated),
  };
  immutable.set(repo, sha, '::tree', out);
  return out;
}

// Issues, newest first. The LIST api and never the search index — search is
// eventually consistent, which is how a just-created item goes missing from a view
// whose whole job is showing what is happening right now.
//
// Two-tier by design, and this is the shape the 24h TTL actually applies to:
//   - page 1 is live (it holds every open item) → conditional, revalidated always;
//   - pages 2..n are settled history → TTL, default 24h.
// So the open queue is never stale, and yesterday's history is not re-fetched.
export async function listIssues(repo, token, { pages = 5, perPage = 100, historyTtl = DAY_MS } = {}) {
  const out = [];
  let scanned = 0;
  let complete = false;
  let fromCache = 0;

  // PRs come back from the issues endpoint and are filtered out, so the FILTERED
  // length says nothing about whether more pages exist — a page of pure PRs would
  // read as the end of history. Pagination is decided by the raw page length, which
  // is therefore carried alongside the projection, cached and all.
  const project = (body) => {
    const list = Array.isArray(body) ? body : [];
    return { items: list.filter((i) => !i.pull_request).map(projectIssue), raw: list.length };
  };

  for (let page = 1; page <= pages; page += 1) {
    const path = `/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=${perPage}&page=${page}`;
    let batch;

    if (page === 1) {
      // Page 1 holds every open item, so it is never served from a TTL — it is
      // revalidated on every load, which is free when nothing changed.
      batch = await conditional(path, token, { transform: project });
    } else {
      const ck = `issues:${repo}:p${page}`;
      const hit = ageing.get(ck, historyTtl);
      if (hit !== undefined) {
        batch = hit;
        fromCache += 1;
        rate.served += 1;
      } else {
        const res = await raw(path, { token });
        rate.spent += 1;
        if (!res.ok) throw await fail(res, path);
        batch = project(await res.json());
        // Settled history: a full page is a closed window and a short one is the end
        // of it. Both are safe to keep for the TTL.
        ageing.set(ck, batch);
      }
    }

    out.push(...batch.items);
    scanned += batch.raw;
    if (batch.raw < perPage) { complete = true; break; }
  }
  return { issues: out, scanned, complete, fromCache };
}

export const listRuns = (repo, token, perPage = 40) =>
  conditional(`/repos/${repo}/actions/runs?per_page=${perPage}`, token, {
    transform: (r) => (r.workflow_runs ?? []).map(projectRun),
  });

export const listComments = (repo, number, token) =>
  conditional(`/repos/${repo}/issues/${number}/comments?per_page=100`, token);

// Who the viewer is. Also the cheapest possible credential check — a bad token fails
// here rather than three calls into a fleet sweep. Takes no repo: identity is not
// scoped to one.
export const getViewer = (token) =>
  conditional('/user', token, { transform: (u) => ({ login: u.login, avatar_url: u.avatar_url, html_url: u.html_url }) });
