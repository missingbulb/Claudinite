// The client-side cache. Browser-only, and the reason a fleet-wide dashboard is
// affordable at all: without it, one page load across a dozen members spends
// several hundred API calls of a 5,000/hour budget, and a second look a minute
// later spends them again.
//
// THREE STRATEGIES, because the data has three different shapes and one TTL over
// all of them would be wrong in both directions:
//
//   IMMUTABLE  — repo content at a commit sha. A path at a sha cannot change, so
//                this is cached under the sha and never revalidated. The task
//                declarations are the whole win here: unchanged `main` means zero
//                calls to re-read every task.mjs.
//   VALIDATED  — anything live (open items, runs). Cached WITH its ETag and
//                re-requested with `If-None-Match`. GitHub answers 304 when
//                nothing changed, and a 304 does not count against the rate limit,
//                so this is free freshness rather than stale data.
//   AGEING     — closed history, which is settled but not addressable by a sha.
//                Plain TTL, 24h by default.
//
// Storage is `localStorage`, holding COMPACT PROJECTIONS rather than API payloads:
// a fleet's raw issue JSON is tens of megabytes and the quota is ~5, so what goes
// in is only the fields the model reads back out.

const NS = 'claudinite-dashboard';
// Bump when a stored shape changes: entries from an older writer are dropped rather
// than misread, which is cheaper and safer than migrating a cache.
const VERSION = 3;
export const DAY_MS = 24 * 3600e3;

const key = (k) => `${NS}:v${VERSION}:${k}`;

const now = () => Date.now();

function read(k) {
  try {
    const raw = localStorage.getItem(key(k));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;   // unparseable or unavailable is a miss, never a throw
  }
}

// A write that cannot happen is a cache miss next time and nothing worse, so a full
// quota degrades to "uncached" rather than breaking the page. One eviction sweep is
// attempted first: the oldest entries go, since the newest are what this page is
// using right now.
function write(k, value) {
  try {
    localStorage.setItem(key(k), JSON.stringify(value));
    return true;
  } catch {
    evictOldest(0.25);
    try {
      localStorage.setItem(key(k), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

function ourKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${NS}:`)) out.push(k);
    }
  } catch { /* unavailable */ }
  return out;
}

function evictOldest(fraction) {
  const entries = [];
  for (const k of ourKeys()) {
    try {
      const at = JSON.parse(localStorage.getItem(k))?.at ?? 0;
      entries.push([k, at]);
    } catch {
      entries.push([k, 0]);   // undecodable sorts first — evict it
    }
  }
  entries.sort((a, b) => a[1] - b[1]);
  for (const [k] of entries.slice(0, Math.max(1, Math.ceil(entries.length * fraction)))) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

// Drop every entry this tool owns — the "something looks wrong" lever, and what a
// version bump would otherwise need a migration for.
export function clearAll() {
  for (const k of ourKeys()) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

export function stats() {
  const keys = ourKeys();
  let bytes = 0;
  for (const k of keys) bytes += (localStorage.getItem(k)?.length ?? 0) + k.length;
  return { entries: keys.length, bytes };
}

// --- immutable: content at a sha ------------------------------------------------

export const immutable = {
  get(repo, sha, path) {
    const hit = read(`blob:${repo}:${sha}:${path}`);
    return hit ? hit.data : undefined;   // undefined = miss; null is a real cached value
  },
  set(repo, sha, path, data) {
    return write(`blob:${repo}:${sha}:${path}`, { at: now(), data });
  },
};

// --- validated: live data with an ETag ------------------------------------------

export const validated = {
  get(url) {
    return read(`etag:${url}`);          // { at, etag, data } | null
  },
  set(url, etag, data) {
    return write(`etag:${url}`, { at: now(), etag, data });
  },
  // Refresh the stored timestamp when a 304 confirms the body is still current, so
  // `at` means "known good at" rather than "first fetched at".
  touch(url) {
    const hit = read(`etag:${url}`);
    if (hit) write(`etag:${url}`, { ...hit, at: now() });
  },
};

// --- ageing: settled history under a TTL ----------------------------------------

export const ageing = {
  get(k, ttl = DAY_MS) {
    const hit = read(`ttl:${k}`);
    if (!hit) return undefined;
    if (now() - hit.at >= ttl) return undefined;
    return hit.data;
  },
  set(k, data) {
    return write(`ttl:${k}`, { at: now(), data });
  },
  ageOf(k) {
    const hit = read(`ttl:${k}`);
    return hit ? now() - hit.at : null;
  },
};

// --- the rate-limit snapshot ----------------------------------------------------

// The last thing GitHub said about this credential's budget, kept so a FRESH TAB can
// plan its first load instead of discovering the limit by hitting it. It is a fact
// about the viewer rather than about any repo, so it survives `clearAll` being aimed
// at stale data — but not the version bump, which drops everything.
export const rateState = {
  get() {
    const hit = read('rate:state');
    return hit ? { ...hit.data, at: hit.at } : null;
  },
  set(data) { return write('rate:state', { at: now(), data }); },
};

// --- projections ----------------------------------------------------------------

// What actually gets stored for an issue. The full API payload carries reactions,
// user objects, URLs and a body that can be tens of kilobytes; the model reads none
// of that for a CLOSED item, and for an open one it needs only the body's two
// scheduling fields — which are near the top, so a truncated body still parses.
//
// `truncateBody` is why a fleet's history fits in the quota at all.
const BODY_KEEP = 600;

export const projectIssue = (i) => ({
  number: i.number,
  title: i.title,
  state: String(i.state ?? '').toLowerCase(),
  labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean),
  created_at: i.created_at,
  updated_at: i.updated_at,
  closed_at: i.closed_at ?? null,
  comments: i.comments ?? 0,
  // Only an OPEN item's body is ever read (Not-before / Blocked-by / task path).
  body: String(i.state ?? '').toLowerCase() === 'open' ? String(i.body ?? '').slice(0, BODY_KEEP) : '',
});

// An open pull request, kept only for what a "waiting on a person" count needs. The
// body is dropped outright: nothing reads a PR's text here.
export const projectPull = (p) => ({
  number: p.number,
  title: p.title,
  created_at: p.created_at,
  updated_at: p.updated_at,
  draft: Boolean(p.draft),
  user: p.user?.login ?? null,
});

export const projectRun = (r) => ({
  name: r.name,
  // The workflow FILE this run came from, which is how a scheduler or executor run is
  // told from the repo's own CI. Kept beside the display name rather than instead of
  // it: the name is a member's to change, the path is the engine's, and either alone
  // would misread a run the other would have caught.
  path: r.path ?? null,
  status: r.status,
  conclusion: r.conclusion ?? null,
  event: r.event,
  head_branch: r.head_branch,
  created_at: r.created_at,
  html_url: r.html_url,
});
