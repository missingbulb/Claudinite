// Technology pack: a backend built on the Cloudflare Workers runtime and its
// bindings — D1, R2, Vectorize, Workflows, Workers AI, Containers — driven
// through Wrangler. The platform's own limits and deploy-window hazards, and
// the binding boundary that forces everything else into plain, fake-tested
// modules.
//
// Fingerprint: a wrangler config (toml, json, or jsonc) at the repo root or
// one directory down (a monorepo's backend/ or worker/ dir), but never
// deeper, so a stray one in a nested fixture or example tree can't trip
// detection.
const MARKERS = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];
const hasMarkerNearRoot = (ctx) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return MARKERS.includes(parts[parts.length - 1]) && parts.length <= 2;
  });

export default {
  version: '60906.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'the Cloudflare Workers platform: Wrangler, D1, R2, Vectorize, Workflows, Workers AI and Containers',
    excludes: 'shipping a static site with no Worker — static-website; a different serverless vendor — aws-sam; generic Node conventions — node',
  },
  marker: 'a wrangler.toml/.json/.jsonc config (at the repo root or one directory down)',
  detect: hasMarkerNearRoot,
};
