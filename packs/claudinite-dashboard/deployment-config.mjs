// The deployment's settings, and where each one lives.
//
// ONE READER, because two things need the same facts and must never disagree about
// where sign-in is configured: the site build (which bakes the pair into the page's
// own config) and the deploy-oauth-exchange task (which mints the URL the pair names).
// A second copy would let a deployment configure the button against one App and the
// endpoint against another.
//
// TWO STORES, split by who has to edit them. Everything describing what the dashboard
// COVERS — its mode, owner, roster, exclusions — is the member's own declaration,
// where it is reviewable in a diff. The sign-in pair are REPOSITORY VARIABLES: they
// are the two values an owner sets while standing in the GitHub App's settings page,
// and `exchangeUrl` in particular is minted by a deploy rather than authored, so
// asking for a commit to record it puts a merge between the endpoint going live and
// the button appearing.
//
// Neither is a secret. The client id is in every authorize URL the page builds and the
// exchange URL is fetched by the browser, so both are public by construction; a
// variable is simply the non-committed store for a non-sensitive value.
//
// THE DECLARATION IS STILL READ, as the fallback, and a build that uses it says so.
// Nothing converges a member's own settings file, so a deployment that configured the
// pair before this existed must keep working rather than losing its Sign in button on
// the next build. That fallback is the migration, not a second supported store.
import { readFile } from 'node:fs/promises';
import { settingsPath } from '../../engine/settings-file.mjs';

export const PACK_ID = 'claudinite-dashboard';

// The repository variables the sign-in pair travel in, keyed by the config name each
// one falls back to. Namespaced, because a variable's name is repo-global and this
// pack does not own the word `CLIENT_ID`.
export const SIGN_IN_VARS = {
  clientId: 'CLAUDINITE_DASHBOARD_CLIENT_ID',
  exchangeUrl: 'CLAUDINITE_DASHBOARD_EXCHANGE_URL',
};

export async function declaredConfig(repoRoot) {
  let decl = null;
  try {
    decl = JSON.parse(await readFile(settingsPath(repoRoot), 'utf8'));
  } catch {
    return {};
  }
  const entry = (decl?.packs ?? []).find((p) => (typeof p === 'string' ? p : p?.id) === PACK_ID);
  return (typeof entry === 'object' && entry?.config) || {};
}

// The declaration with the sign-in pair resolved: the variable where it is set, the
// declared value otherwise. `legacy` names the keys that fell back, for the caller to
// report — a deployment still configuring these in git is working but on the old
// footing, and silence would leave that indefinitely undiscovered.
//
// An empty variable is UNSET, not an override: a repository variable cleared in the
// settings box still arrives as an empty string, and reading that as "no client id"
// where the declaration has one would turn a cleared box into a silently disabled
// button.
export async function deploymentConfig(repoRoot, env = process.env) {
  const cfg = await declaredConfig(repoRoot);
  const legacy = [];
  for (const [key, variable] of Object.entries(SIGN_IN_VARS)) {
    const fromVar = String(env[variable] ?? '').trim();
    if (fromVar) cfg[key] = fromVar;
    else if (cfg[key]) legacy.push(`${key} (set \`${variable}\` instead)`);
  }
  return { cfg, legacy };
}
