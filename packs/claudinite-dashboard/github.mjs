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

import { immutable, validated, ageing, rateState, projectIssue, projectRun, DAY_MS } from './cache.mjs';

const API = 'https://api.github.com';

export const rate = {
  remaining: null, limit: null, reset: null,
  spent: 0, revalidated: 0, served: 0, withheld: 0,
  // Set when GitHub says the budget is gone. Every later call in the same load reads
  // it and skips the request: twelve members' worth of calls that can only fail is
  // twelve more chances to trip the SECONDARY limit, which is measured in requests
  // made rather than in budget left.
  exhaustedUntil: null,
};

export const resetCounters = () => { rate.spent = 0; rate.revalidated = 0; rate.served = 0; rate.withheld = 0; };

// The budget policy this page is reading under. `budget.mjs` decides it; everything
// here only obeys it. The default is the old unconditional behaviour, so a caller
// that never sets one behaves exactly as before.
export let policy = { mode: 'live', minAge: 0, historyTtl: DAY_MS, spendCeiling: Infinity };
export const setPolicy = (p) => { policy = { ...policy, ...p }; };

// Refusing to spend is not an error in the data — it is this page choosing to keep
// the viewer's remaining requests. Rendered as a row that says so, never as a fault
// of the repo being read.
export class RateBudgetError extends Error {
  constructor(path) {
    super('not read — saving the remaining rate limit');
    this.status = 'budget';
    this.path = path;
  }
}

const budgetLeft = () => rate.spent < policy.spendCeiling;

const frozen = (now = Date.now()) => Number.isFinite(rate.exhaustedUntil) && rate.exhaustedUntil > now;

// Carry the last known budget across page loads. Without it every fresh tab starts
// blind, reads live, and only learns it was nearly out AFTER spending a sweep's worth
// of requests finding out.
export function restoreRate() {
  const s = rateState.get();
  if (!s) return null;
  rate.remaining = s.remaining ?? null;
  rate.limit = s.limit ?? null;
  rate.reset = s.reset ?? null;
  rate.exhaustedUntil = s.exhaustedUntil ?? null;
  return s;
}

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

  // A 403/429 with nothing left is the primary limit, and it stays spent until the
  // window rolls. `retry-after` is honoured when present because the secondary limit
  // sends that instead of a zeroed remaining.
  if ((res.status === 403 || res.status === 429)) {
    const retryAfter = headerNumber(res, 'retry-after');
    if (retryAfter !== null) rate.exhaustedUntil = Date.now() + retryAfter * 1000;
    else if (rate.remaining === 0 && Number.isFinite(rate.reset)) rate.exhaustedUntil = rate.reset * 1000;
  } else if (rate.remaining > 0) {
    rate.exhaustedUntil = null;
  }
  rateState.set({ remaining: rate.remaining, limit: rate.limit, reset: rate.reset, exhaustedUntil: rate.exhaustedUntil });
}

// The one call GitHub does not charge for: `/rate_limit` reports the budget without
// spending any of it. Asked once at boot so the FIRST load of a tab is planned on the
// real number rather than on a guess — which is the whole difference between a fleet
// sweep that fits in an anonymous 60 and one that dies a third of the way through.
export async function preflightRate(token) {
  try {
    const res = await raw('/rate_limit', { token });
    noteRate(res);
    if (!res.ok) return null;
    const body = await res.json();
    const core = body?.resources?.core ?? body?.rate;
    if (core && Number.isFinite(core.remaining)) {
      rate.remaining = core.remaining;
      rate.limit = core.limit ?? rate.limit;
      rate.reset = core.reset ?? rate.reset;
      if (core.remaining > 0) rate.exhaustedUntil = null;
      rateState.set({ remaining: rate.remaining, limit: rate.limit, reset: rate.reset, exhaustedUntil: rate.exhaustedUntil });
    }
    return { remaining: rate.remaining, limit: rate.limit, reset: rate.reset };
  } catch {
    return null;   // an unreachable preflight plans nothing and breaks nothing
  }
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

  // Under pressure a young entry is served with NO request at all. An ETag
  // revalidation costs no primary budget, but it is still a request against the
  // secondary limit and still a round trip — and when the budget is nearly gone,
  // "the page reloads for free" is worth more than a few minutes of freshness.
  if (hit && policy.minAge > 0 && Date.now() - (hit.at ?? 0) < policy.minAge) {
    rate.served += 1;
    return hit.data;
  }
  if (frozen() || !budgetLeft()) {
    if (hit) { rate.withheld += 1; return hit.data; }
    throw new RateBudgetError(path);
  }

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

  if (frozen() || !budgetLeft()) throw new RateBudgetError(path);
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

  if (frozen() || !budgetLeft()) throw new RateBudgetError(`/repos/${repo}/git/trees`);
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
export async function listIssues(repo, token, { pages = 5, perPage = 100, historyTtl = null } = {}) {
  const ttl = historyTtl ?? policy.historyTtl ?? DAY_MS;
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
      const hit = ageing.get(ck, ttl);
      if (hit !== undefined) {
        batch = hit;
        fromCache += 1;
        rate.served += 1;
      } else if (frozen() || !budgetLeft()) {
        // History is the cheapest thing to go without: page 1 already holds the live
        // queue, so a withheld page 2 costs depth, never correctness.
        rate.withheld += 1;
        break;
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
