import { adoptedPages, CONFIG_PATH } from './lib.mjs';

// Serving a site from GitHub Pages: the nightly release that deploys the default
// branch, the one vendored workflow that performs the deploy, the config naming what
// is published, and the subpath the result is served from. The version is not here:
// public-website owns the scheme and the page stamp, and the release reaches that
// pack's `public/version.mjs` to advance it when the pack is declared.
export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'serving a site from GitHub Pages: the nightly release, the vendored deploy workflow, site.config, the serving subpath',
    excludes: 'the version scheme and the page stamp — public-website; markup — html',
  },
  marker: CONFIG_PATH,
  detect: adoptedPages,
  // The release is a work item: the queue owns its trigger, its gate and its park
  // lanes, which is the whole reason it is a task rather than a push-triggered
  // workflow.
  requires: ['claudinite-tasks'],

  // Adoption interview. One question, a genuine fork in the road the pack cannot
  // default: WHAT is published, an additive list only the project knows. The answer
  // does not become config on the member's pack entry: its home is the repo's own
  // .github/site.config, where the deploy's build step and the checks both read it.
  questions: [
    {
      id: 'publish_set',
      prompt: 'Which files and folders make up the published site — the exact list, and the directory it is rooted at? The artifact is built from this list and nothing else, so name the pages, assets and data the site actually serves (not "everything except the tooling").',
      distill: "written into the repo's own .github/site.config as publish_root + publish_paths (with build_command), which is where the deploy's build step and the gp/site-config check both read it",
    },
  ],

  // Settings, not repo content: no workflow, check or agent can turn these on, and a
  // deploy that silently depends on one fails its first run for a reason nobody
  // wrote down.
  adoptionHandover: [
    {
      step: 'Settings → Pages → Build and deployment → Source = "GitHub Actions" (not "Deploy from a branch").',
      breaks: 'actions/deploy-pages fails and nothing is ever served.',
      done: 'the first site-release run deploys successfully.',
    },
    {
      step: 'Settings → Environments → github-pages → deployment branches must allow the default branch.',
      breaks: 'the deploy job is refused by the environment after the version is already cut.',
      done: 'the deploy job runs rather than waiting on an environment rule.',
    },
  ],
};
