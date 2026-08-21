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
// miss is a plain default — every key EXCEPT `mode`, which the build requires and
// refuses to guess; see `resolveMode`.
//
// Shape:
//   {
//     "mode":        "repo",                             // "repo" | "fleet" — REQUIRED, no default
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
  // WHICH DASHBOARD THIS IS, and the one key with no default. `repo` is this repo's own
  // page; `fleet` is the overview across a roster. Silence used to mean `repo`, which
  // made a fleet deployment that lost its roster source publish as a one-repo page and
  // look intentional — so the build refuses to publish a declaration that does not say.
  // Null here is not a default: it is what a locally-served checkout with no config file
  // at all reads, and `isFleetConfig` renders that as one repo's page.
  mode: null,
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

// The two dashboards this pack builds. A deployment is one or the other and says so.
export const MODES = Object.freeze(['repo', 'fleet']);

// Whether a config names anywhere for members to come from. Both spellings of the same
// idea travel together on purpose: the BUILD reads `rosterFile`, a path inside the repo,
// and the PAGE reads `rosterUrl`, a URL beside it — a guard that knew only one would
// read a legacy fleet declaration as naming nothing. A single-entry `repos` is this
// repo, named, and not a roster.
export const hasRosterSource = (config) =>
  Boolean(config?.owner || config?.rosterUrl || config?.rosterFile || (config?.repos?.length ?? 0) > 1);

// The mode, or a throw. This is the only place the judgment lives, so the build and the
// page cannot drift into two matching-looking expressions that disagree at one input.
//
// It refuses three things, and the third is the one worth having: a mode that
// CONTRADICTS the rest of the config. `fleet` naming no roster source would publish a
// fleet page over nothing; `repo` beside an owner would silently ignore the owner. Both
// are a deployment that believes something the site is not doing, which is exactly the
// failure the key exists to make loud.
export function resolveMode(config) {
  const mode = config?.mode ?? null;
  if (mode === null) {
    throw new Error(
      'this deployment does not say which dashboard it is: set "mode" to "repo" (this repo\'s own page) '
      + 'or "fleet" (the overview) in the claudinite-dashboard config. There is no default — silence used to '
      + 'mean "repo", which let a fleet deployment that lost its roster publish as one repo and look intentional.');
  }
  if (!MODES.includes(mode)) {
    throw new Error(`claudinite-dashboard mode "${mode}" is not a mode — it is "repo" or "fleet".`);
  }
  if (mode === 'fleet' && !hasRosterSource(config)) {
    throw new Error(
      'mode is "fleet" but the config names no roster source — add "owner" (enumerated as the viewer), '
      + 'or "repos"/"rosterUrl"/"rosterFile". A fleet page over nothing is the state this guard exists to catch.');
  }
  if (mode === 'repo' && hasRosterSource(config)) {
    throw new Error(
      'mode is "repo" but the config names a roster source, which a repo page never reads — '
      + 'drop it, or set mode to "fleet".');
  }
  return mode;
}

// Whether this deployment is a FLEET one. It READS the stated mode rather than inferring
// it from the roster: what a deployment covers is a thing it declares, not a thing
// deduced from which other keys happen to be present.
export const isFleetConfig = (config) => config?.mode === 'fleet';

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
