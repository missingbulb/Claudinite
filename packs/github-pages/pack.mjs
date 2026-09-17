import { servesPages, STUB_FILE, STUB_NAME } from './worldRules/pages-workflows.mjs';

// Serving a site from GitHub Pages: the release-on-push orchestrator, the
// GitHub Release it cuts, the Pages deploy of that exact commit, and the
// subpath the result is served from. The pipeline is authored once in this
// pack's stubs/ and vendored into each site repo's own .github/ (GitHub
// resolves reusable workflows and composite actions only from a repo's own
// .github/), so a repo hosts the pipeline without owning it.
//
// WHAT IS NOT HERE: the version scheme, `.github/site.config`, the publish set
// and the composite actions that read them are the static-website pack's — they
// are true of a static site whatever serves it, and this pack requires that one
// rather than restating them. Declaring THIS pack is the statement "and it is
// served from Pages"; a site that deploys to a host of its own declares only
// static-website and carries none of the machinery below.
//
// The standard itself — the flow, the dispatches and the setup a new site repo
// needs — is skills/, not prose: it is wanted when a pipeline is being set up or
// debugged, not carried by every session in the repo.
export default {
  version: '60917.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'serving a site from GitHub Pages: release on push, the Release it cuts, the Pages deploy, the serving subpath',
    excludes: 'the version scheme, site.config and the publish set — static-website; Cloudflare-served sites — cloudflare-site; markup — html',
  },
  marker: `.github/workflows/${STUB_FILE} (named "${STUB_NAME}")`,
  detect: servesPages,
  // The site's config, its version scheme and the three composite actions these
  // workflows run all ship with static-website; a Pages repo carries both
  // vendored sets.
  requires: ['static-website'],

  // Settings, not repo content: no workflow, check or agent can turn these on,
  // and a pipeline that silently depends on one fails its first run for a reason
  // nobody wrote down.
  adoptionHandover: [
    {
      step: 'Settings → Pages → Build and deployment → Source = "GitHub Actions" (not "Deploy from a branch").',
      breaks: 'actions/deploy-pages fails and nothing is ever served.',
      done: 'the first release-on-push run deploys successfully.',
    },
    {
      step: 'Settings → Actions → General → Workflow permissions = "Read and write permissions".',
      breaks: 'the pipeline cannot cut the Release, and a bump: major dispatch cannot push.',
      done: 'a release run creates its tag and Release.',
    },
    {
      step: 'Settings → Environments → github-pages → deployment branches must allow the default branch.',
      breaks: 'the deploy job is refused by the environment after the Release is already cut.',
      done: 'the deploy job runs rather than waiting on an environment rule.',
    },
  ],
};
