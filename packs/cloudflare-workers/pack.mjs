// Technology pack: a backend built on the Cloudflare Workers runtime and its
// bindings (D1, R2, Vectorize, Workflows, Workers AI, Containers) driven
// through Wrangler. The platform's own limits and deploy-window hazards, and
// the binding boundary that forces everything else into plain, fake-tested
// modules.
const MARKERS = ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];
const hasMarkerNearRoot = (ctx) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return MARKERS.includes(parts[parts.length - 1]) && parts.length <= 2;
  });

export default {
  version: '60920.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'the Cloudflare Workers platform: Wrangler, D1, R2, Vectorize, Workflows, Workers AI and Containers',
    excludes: 'serving a static site from Workers assets — cloudflare-site; a different serverless vendor — aws-sam; generic Node conventions — node',
  },
  marker: 'a wrangler.toml/.json/.jsonc config (at the repo root or one directory down)',
  detect: hasMarkerNearRoot,
};
