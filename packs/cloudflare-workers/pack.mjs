// Technology pack: a backend built on Cloudflare Workers and its bound storage
// (D1, R2, Vectorize, Queues), driven with Wrangler. Every rule here is a
// runtime/deploy-ordering or toolchain gotcha with no clean static signature —
// a schema-vs-deploy race, a types collision that only shows up once a
// frontend shares the repo, a test harness's choice of config, a CLI output's
// own error markers — so the pack stays prose-only for now.
//
// Fingerprint: a `wrangler.toml` (or `wrangler.jsonc`/`wrangler.json`, its
// newer equivalents) at the repo root or one directory down (a monorepo's
// `server`/`backend`/`api` dir), never deeper, so a nested fixture or example
// config can't trip detection.
const WRANGLER_CONFIG = new Set(['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']);

const hasMarkerNearRoot = (ctx) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return WRANGLER_CONFIG.has(parts[parts.length - 1]) && parts.length <= 2;
  });

export default {
  version: '60823.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'Cloudflare Workers backends: D1/R2/Vectorize/Queues bindings, deploy-vs-migration ordering, Wrangler-driven local/test workflows',
    excludes: 'generic Node packaging — node; any browser test harness — headless-browser; scraping a third-party site — web-scraping',
  },
  marker: 'a wrangler.toml/.jsonc/.json (at the repo root or one directory down)',
  detect: hasMarkerNearRoot,
};
