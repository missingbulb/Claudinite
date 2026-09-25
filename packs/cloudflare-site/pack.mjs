// Technology-plus-aspect pack: a static tree served from Cloudflare Workers static
// assets on its own domain, the nightly release that uploads it, the boundary of what
// reaches a public URL, and the parts of the deployment only a person holding the
// Cloudflare account can do. The version is not here: public-website owns the scheme
// and the page stamp, and the release reaches that pack's `public/version.mjs` to
// advance it when the pack is declared.
import { parseWranglerConfig, wranglerConfigPath } from './lib.mjs';

const servesASite = (ctx) => {
  const path = wranglerConfigPath(ctx.tracked);
  return Boolean(path && parseWranglerConfig(ctx.read(path))?.assets?.directory);
};

export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'serving a static site from Cloudflare: the published tree, custom domains, the nightly release that uploads it',
    excludes: 'Workers runtime and bindings — cloudflare-workers; the version scheme and the page stamp — public-website; markup — html',
  },
  marker: 'a near-root wrangler.json/.jsonc declaring assets.directory',
  detect: servesASite,
  // The release is a work item: the queue owns its trigger, its gate, its secrets
  // and its park lanes, which is the whole reason it is a task rather than a
  // workflow.
  requires: ['claudinite-tasks'],

  // No interview. Everything this pack needs about a deployment — the published
  // tree, the hostnames claimed, whether analytics is wanted — is already stated
  // structurally in the repo (the wrangler config, and whether a published file
  // carries the beacon placeholder), and a question whose answer is already in the
  // tree is a second place for it to be wrong.

  // What adoption genuinely cannot do: everything on the Cloudflare account. The
  // zone's two DNS deletions are NOT here — they are leftovers a repo may or may
  // not have, evaluated by the release's own preflight and by
  // `no-second-publisher`, because a checkbox that is a no-op for most adopters
  // teaches the reader to skim the list that exists to stop them skimming.
  adoptionHandover: [
    {
      step: 'Add the site\'s domain as a zone on the Cloudflare account, and point the registrar\'s nameservers at the two Cloudflare shows at the end of that flow — https://dash.cloudflare.com/?to=/:account/add-site',
      breaks: 'the deploy fails outright — the wrangler config claims the domain as a custom domain, so every release parks at needs-human-action until the zone reads Active',
      done: 'the zone reads Active on https://dash.cloudflare.com/?to=/:account/websites',
    },
    {
      step: 'Add the Cloudflare Account ID (Overview, right-hand column) as the repository secret CLOUDFLARE_ACCOUNT_ID',
      breaks: 'the release stops at its own gate, before it touches Cloudflare, parking with the missing secret named — nothing is left half-done',
      done: 'a site-release run gets as far as wrangler',
    },
    {
      step: 'Create an API token from the "Edit Cloudflare Workers" template (https://dash.cloudflare.com/profile/api-tokens) and add it as the repository secret CLOUDFLARE_API_TOKEN',
      breaks: 'same gate as the account id; a token narrower than that template instead fails inside wrangler with a 10000-class error, which the worker parks as needs-human-action',
      done: 'a site-release run uploads and the domain serves the site',
    },
  ],
};
