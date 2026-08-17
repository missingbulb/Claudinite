// Where the page gets its deployment-specific facts. Everything host-specific lives
// in a `dashboard.config.json` beside the page, never in the code — the same mounted
// dashboard serves a member repo checked out locally and a fleet-wide Pages site,
// and only the config differs.
//
// Absent config is a valid deployment, not a broken one: it means the token-paste
// provider and whatever repo the URL names. So every key here is optional and every
// miss is a plain default.
//
// Shape:
//   {
//     "clientId":    "Iv1.abc123",                       // GitHub App / OAuth App client id
//     "exchangeUrl": "https://…/github-oauth",           // the code→token endpoint
//     "redirectUri": "https://owner.github.io/Repo/",    // defaults to this page's URL
//     "scope":       "repo",                             // classic OAuth Apps only
//     "rosterUrl":   "./fleet-roster.GENERATED.json",    // the repo selector's source
//     "repos":       ["owner/a", "owner/b"],             // an inline roster instead
//     "defaultRepo": "owner/a"
//   }

export const DEFAULTS = {
  clientId: null,
  exchangeUrl: null,
  redirectUri: null,
  scope: null,
  rosterUrl: null,
  repos: [],
  defaultRepo: null,
};

export async function loadConfig(url = './dashboard.config.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(await res.json()) };
  } catch {
    return { ...DEFAULTS };
  }
}

// The repo list for the selector. Three sources, in precedence order: an explicit
// inline list, a roster artifact, or nothing — and "nothing" is a single-repo
// deployment, which is the member case.
//
// A roster is read for its KEYS under `repos` when it is a fleet artifact (the shape
// Sheepdog already generates), or as a plain array of names. Both are accepted
// because the artifact's job is not to serve this page and its shape is not ours to
// dictate.
export function rosterFrom(doc) {
  if (Array.isArray(doc)) return doc.filter((x) => typeof x === 'string');
  if (Array.isArray(doc?.repos)) return doc.repos.filter((x) => typeof x === 'string');
  if (doc?.repos && typeof doc.repos === 'object') return Object.keys(doc.repos);
  return [];
}

export async function loadRoster(config) {
  if (config.repos?.length) return config.repos;
  if (!config.rosterUrl) return [];
  try {
    const res = await fetch(config.rosterUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    return rosterFrom(await res.json());
  } catch {
    return [];
  }
}
