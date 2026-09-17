import { adoptedStandard, CONFIG_PATH } from './worldRules/vendored-pipeline.mjs';

// The static-site standard: a plain static site that carries a date-anchored
// version, declares what it publishes in one explicit list, and gates its pull
// requests on assembling that list. The config-reading actions and the PR gate
// are authored once in this pack's stubs/ and vendored into each site repo's own
// .github/ (GitHub resolves a composite action only from a repo's own .github/),
// so a repo hosts them without owning them.
//
// WHAT IS NOT HERE: whatever SERVES the site. Release-on-push, the Release it
// cuts and the Pages deploy are the github-pages pack's; a Cloudflare-served site
// is cloudflare-site's. This pack is what is true of a static site whichever one
// of them is bolted on, so a repo declares this one plus at most one of those.
//
// Fingerprinted by the site config, the pack's own central artifact — declaring
// is still what activates the pack.
//
// The standard itself — the contract the rules below judge against, and the setup
// a new site repo needs — is skills/, not prose: it is wanted when a pipeline is
// being set up or debugged, not carried by every session in the repo.
export default {
  version: '60913.2',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'shipping a static site: date-anchored versioning, the explicit publish set, the PR gate, client-side caching',
    excludes: 'the Pages release and deploy — github-pages; Cloudflare serving — cloudflare-site; markup — html; store publication — the release packs',
  },
  marker: CONFIG_PATH,
  detect: adoptedStandard,
  // The site is HTML built and checked over GitHub Actions. Only the markup pack
  // is named here: the workflow-platform rules live in git-github, which basics'
  // own `requires` already materializes into every declaration.
  requires: ['html'],

  // Adoption interview. One question, a genuine fork in the road the pack cannot
  // default: WHAT is published, an additive list only the project knows. Where the
  // site is SERVED is no longer asked — declaring github-pages (or not) is that
  // answer. The answer does not become config on the member's pack entry: the
  // publish set's home is the repo's own .github/site.config, where the vendored
  // actions and the checks both read it.
  questions: [
    {
      id: 'publish_set',
      prompt: 'Which files and folders make up the published site — the exact list, and the directory it is rooted at? The artifact is built from this list and nothing else, so name the pages, assets and data the site actually serves (not "everything except the tooling").',
      distill: "written into the repo's own .github/site.config as publish_root + publish_paths (with version_files, build_command and test_command), which is where the vendored actions and the sw/site-config check both read it",
    },
  ],

  // Delivery, not state: the tree always carries a version, and only the diff
  // says whether it moved with the published files beside it.
};
