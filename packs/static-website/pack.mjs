import releaseWorkflows, { shipsPipeline, STUB_FILE, STUB_NAME } from './release-workflows.mjs';
import siteConfig from './site-config.mjs';
import versionScheme from './version-scheme.mjs';

// The static-website standard: a plain static site that releases on push, carries
// a date-anchored version, and serves from GitHub Pages out of an EXPLICIT
// publish set. The pipeline is authored once in this pack's stubs/ and vendored
// into each site repo's own .github/ (GitHub resolves reusable workflows and
// composite actions only from a repo's own .github/), so a repo hosts the
// pipeline without owning it.
//
// Fingerprinted by the orchestrator — a repo declaring the pack for the
// versioning and CI half while its site deploys somewhere other than Pages
// carries none of it, and every rule here is relevance-gated on it, so nothing
// fires on that repo. The declaration is still what activates the pack.
export default {
  id: 'static-website',
  ruleRoutingGuidance: {
    belongs: 'shipping and serving a static site: date-anchored versioning, release on push, the publish set, Pages deploy, client-side caching',
    excludes: 'hand-authored markup gotchas — html; generic workflow lint — github-actions; store publication — the release packs',
  },
  badge: 'badge.svg',
  marker: `.github/workflows/${STUB_FILE} (named "${STUB_NAME}")`,
  detect: shipsPipeline,
  // The site is HTML served over GitHub Actions — the markup pack and the
  // workflow-platform pack are what this standard is built on top of.
  requires: ['html', 'github-actions'],
  prose: 'RULES.md',

  // Adoption interview. Two questions, both genuine forks in the road that the
  // pack cannot default: WHERE the site is served (which decides whether the
  // deploy half is vendored at all) and WHAT is published (an additive list only
  // the project knows). Neither answer becomes config on the member's pack entry
  // — the publish set's home is the repo's own .github/site.config, where the
  // pipeline and the checks both read it.
  questions: [
    {
      id: 'hosting',
      prompt: 'Is this site served by GitHub Pages from this repo — the standard\'s release-on-push → Pages pipeline — or does it deploy somewhere else (a host of its own, another repo, a CDN)? Check the repo for an existing deploy workflow or CNAME first and confirm rather than asking cold.',
      distill: 'recorded as intent. "GitHub Pages" vendors the full set (orchestrator + publish/deploy reusables + actions) and opens the one-time Pages settings issue; another host takes the versioning and CI half only, and the deploy stubs are not vendored',
    },
    {
      id: 'publish_set',
      prompt: 'Which files and folders make up the published site — the exact list, and the directory it is rooted at? The artifact is built from this list and nothing else, so name the pages, assets and data the site actually serves (not "everything except the tooling").',
      distill: "written into the repo's own .github/site.config as publish_root + publish_paths (with version_files, build_command and test_command), which is where the pipeline and the sw/site-config check both read it",
    },
  ],

  worldRules: [releaseWorkflows, siteConfig, versionScheme],
};
