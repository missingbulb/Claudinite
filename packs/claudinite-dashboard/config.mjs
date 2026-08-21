// Where the page gets its deployment-specific facts. Everything host-specific lives
// in a `dashboard.config.json` beside the page, never in the code — the same mounted
// dashboard serves a member repo checked out locally and a fleet-wide Pages site,
// and only the config differs.
//
// THE ROSTER IS NORMALLY NOT A LIST. A fleet deployment names an `owner` and the page
// enumerates that owner's repos AS THE VIEWER, so the membership is decided at read
// time by what this person can actually see. That is what keeps a fleet page from
// leaking a repo's existence to someone without access, and it is why no repo list is
// baked into any file here. An explicit `repos` list and a `rosterUrl` artifact are
// both still accepted — a deployment that wants a fixed set says so.
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
//     "defaultRepo": "owner/a",
//     "digestsRepo": "owner/enforcer",                  // where the fleet digests are written
//     "digestsPath": "digests"                           // the directory inside it
//   }

export const DEFAULTS = {
  clientId: null,
  exchangeUrl: null,
  redirectUri: null,
  scope: null,
  rosterUrl: null,
  repos: [],
  // Whose repos this deployment covers, enumerated as the viewer, and which of them are
  // not in the fleet. Both optional: unset means this is one repo's own page.
  owner: null,
  exclude: [],
  defaultRepo: null,
  // The fleet's morning briefs live in whichever repo runs the digest task — the fleet
  // enforcer's, never this one by assumption — so the repo is named rather than
  // guessed, and an unset key means this deployment has no digests panel.
  digestsRepo: null,
  digestsPath: 'digests',
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
// Shepherd already generates), or as a plain array of names. Both are accepted
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

// Whether this deployment is a FLEET one, decided by its shape rather than by a mode
// switch: a config that names where more than one member comes from is a fleet
// deployment, and anything else is one repo's own page. Nothing to ask at adoption and
// nothing to hold in step — the roster source IS the mode.
export const isFleetConfig = (config) =>
  Boolean(config?.owner || config?.rosterUrl || (config?.repos?.length ?? 0) > 1);

// A repo that is in the owner's account but not in the fleet. Archived and forked
// repositories are excluded by their own state rather than by anyone maintaining a
// list, and `exclude` covers the rest — the same key the fleet-digest task already
// reads off this pack's declaration, so a deployment states its exceptions once.
export const inFleet = (repo, exclude = []) =>
  !repo.archived && !repo.fork && !exclude.includes(repo.full_name)
  && !exclude.includes(repo.full_name.split('/')[1]);

// The roster, resolved. Static sources win — a deployment that named its members meant
// it — and `owner` is enumerated live as the viewer. `gh` is injected so this is
// testable without a network and so config.mjs owes the GitHub client nothing.
export async function resolveRoster(config, token, gh) {
  const stated = await loadRoster(config);
  if (stated.length) return { repos: stated, source: 'configured', complete: true };
  if (!config?.owner) return { repos: [], source: 'none', complete: true };
  try {
    const { repos, complete } = await gh.listOwnerRepos(config.owner, token);
    return {
      repos: repos.filter((r) => inFleet(r, config.exclude ?? [])).map((r) => r.full_name).sort(),
      source: 'owner',
      // Whether the enumeration reached the end of the account. A truncated one is
      // said out loud rather than rendered as a fleet that happens to be that size.
      complete,
    };
  } catch (error) {
    return { repos: [], source: 'owner', complete: false, error };
  }
}
