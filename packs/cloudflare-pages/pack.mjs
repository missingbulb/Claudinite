// Technology pack: shipping a STATIC site to Cloudflare — a dedicated Pages
// project, or a Worker's own static-assets binding — through Wrangler. This is
// deliberately not cloudflare-workers: that pack covers a backend built on the
// Workers runtime and its bindings, and explicitly excludes a static site with
// no Worker logic behind it; this pack covers exactly that case, on Cloudflare
// rather than on GitHub Pages (static-website's own ground).
//
// Fingerprint: a near-root Wrangler config that declares a static-assets
// binding (an `assets` key), or any tracked source naming a `wrangler pages
// deploy` invocation — either is a real, specific signal that this is a static
// site shipped through Cloudflare, not merely that Wrangler is present (a pure
// backend Worker's config carries neither).
const CONFIG_NAMES = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];
const ASSETS_KEY = /(^|[^\w])assets"?\s*[:=]|^\s*\[assets\]/m;
const PAGES_DEPLOY = /\bwrangler\b[\s\S]{0,60}\bpages\b[\s\S]{0,20}\bdeploy\b|['"]pages['"]\s*,\s*['"]deploy['"]/i;
const SOURCE = /\.(json|jsonc|toml|ya?ml|mjs|cjs|jsx?|tsx?)$/;

const nearRootConfigs = (ctx) =>
  ctx.tracked.filter((f) => {
    const parts = f.split('/');
    return CONFIG_NAMES.includes(parts[parts.length - 1]) && parts.length <= 2;
  });

const shipsStaticAssets = (ctx) =>
  nearRootConfigs(ctx).some((f) => {
    const text = ctx.read(f);
    return text !== null && ASSETS_KEY.test(text);
  });

const runsPagesDeploy = (ctx) =>
  ctx.tracked.some((f) => {
    if (!SOURCE.test(f)) return false;
    const text = ctx.read(f);
    return text !== null && PAGES_DEPLOY.test(text);
  });

export default {
  version: '60913.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'shipping a static site to Cloudflare — a Pages project or a Worker static-assets binding, custom domains, wrangler deploy classification',
    excludes: 'a Worker running backend logic — cloudflare-workers; a static site on GitHub Pages — static-website; generic Node conventions — node',
  },
  marker: 'a Wrangler static-assets config (an `assets` key, at the repo root or one directory down), or a `wrangler pages deploy` invocation in tracked source',
  detect: (ctx) => shipsStaticAssets(ctx) || runsPagesDeploy(ctx),
};
