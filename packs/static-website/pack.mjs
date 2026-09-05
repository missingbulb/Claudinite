import releaseWorkflows, { shipsPipeline, STUB_FILE, STUB_NAME } from './worldRules/release-workflows.mjs';

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
//
// The standard itself — the contract the rules below judge against, and the setup a
// new site repo needs — is skills/, not prose: it is wanted when a pipeline is being
// set up or debugged, not carried by every session in the repo.
export default {
  version: '60905.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'shipping and serving a static site: date-anchored versioning, release on push, the publish set, Pages deploy, client-side caching',
    excludes: 'hand-authored markup gotchas — html; generic workflow lint — git-github; store publication — the release packs',
  },
  marker: `.github/workflows/${STUB_FILE} (named "${STUB_NAME}")`,
  detect: shipsPipeline,
  // The site is HTML served over GitHub Actions. Only the markup pack is named
  // here: the workflow-platform rules live in git-github, which basics' own
  // `requires` already materializes into every declaration.
  requires: ['html'],

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

  // Delivery, not state: the tree always carries a version, and only the diff
  // says whether it moved with the published files beside it.
};
