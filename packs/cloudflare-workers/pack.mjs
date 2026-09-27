// Technology pack: a backend built on the Cloudflare Workers runtime and its
// bindings (D1, R2, Vectorize, Workflows, Workers AI, Containers) driven
// through Wrangler. The platform's own limits and deploy-window hazards, and
// the binding boundary that forces everything else into plain, fake-tested
// modules.
export default {
  version: '60927.1',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'the Cloudflare Workers platform: Wrangler, D1, R2, Vectorize, Workflows, Workers AI and Containers',
    excludes: 'serving a static site from Workers assets — cloudflare-site; a different serverless vendor — aws-sam; generic Node conventions — node',
  },
  pitch: 'For a repo running Cloudflare Workers, about a dozen rules carry the platform lessons that are expensive to learn in production: routing large uploads through R2, sizing and keying Workflow steps, when native code needs a Container, why database migrations take three merges, telling absent data from unknown, and why a preview deploy URL is not production. The pack is rules only, with no skills, checks or tasks, and its guidance is kept reconciled against Cloudflare\'s own documentation.',
  relevanceDetector: { about: 'a wrangler.toml/.json/.jsonc config (at the repo root or one directory down)', paths: /^([^/]+\/)?wrangler\.(toml|json|jsonc)$/ },
};
