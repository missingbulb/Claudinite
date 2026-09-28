export default {
  version: '60927.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'the browser dashboard over Claudinite scheduler state and the site that publishes it',
    excludes: 'how the scheduler behaves — core; workflow practice — git-github; product sites — public-website',
  },
  pitch: 'Gives the repo a read-only web page showing what its automated Claude work is doing: what is stuck, what is queued, what has already run, and what the rules and checks have been costing and catching. It can also cover a whole fleet of repositories from one overview. Two scheduled tasks keep it live, one republishing the page to GitHub Pages whenever its sources change and one deploying the sign-in endpoint, and neither reports success until the deployed result actually answers.',
  seededByDefault: false,
  requires: ['claudinite-tasks'],
  questions: [
    {
      id: 'mode',
      prompt: 'Is this deployment this repo\'s OWN dashboard, or the fleet overview across many repos? A fleet deployment also needs to name where its members come from — an "owner" whose repos are enumerated in the browser as the viewer (the one to prefer), or an explicit "repos" list or roster artifact.',
      distill: 'set config.mode to "repo" or "fleet" — there is no default and the build refuses to publish without it; a "fleet" answer must come with a roster source (owner/repos/rosterUrl), and a "repo" answer with none',
    },
  ],
  adoptionHandover: [
    {
      step: 'Enable GitHub Pages with source "GitHub Actions" — this repo\'s /settings/pages',
      breaks: 'the publish-pages task pushes the build, and its deploy run then fails — the task parks at needs-human-action naming this',
      done: 'the Pages URL serves the dashboard, and a publish-pages run converged done',
    },
    {
      step: 'Turn on Sign in with GitHub — the pack README\'s "Turning sign-in on" is that checklist.',
      breaks: 'nobody can read the dashboard at all: sign-in is the only way in, so until the pair is set the page '
        + 'shows its gate saying this deployment is not finished being set up, naming the two variables',
      done: 'a signed-in viewer sees the rate pill read “…/5000 · user”',
    },
  ],
  seedOps: [
    {
      template: 'stubs/workflows/claudinite-dashboard-pages.yml',
      dest: '.github/workflows/claudinite-dashboard-pages.yml',
    },
  ],
};
