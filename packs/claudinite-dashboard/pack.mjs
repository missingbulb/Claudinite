// claudinite-dashboard — a browser view of what a repo's (or a fleet's) Claudinite
// scheduler is doing, published as a static site.
//
// It reads only the queue's own vocabulary and the task declarations at HEAD, through the
// tasks pack's published `public/`. Those relative paths resolve identically in the canon
// (`packs/<id>/` beside its siblings) and in a member's mount
// (`.claudinite/shared/packs/<id>/`), so the pack is read straight out of the mount with
// nothing rewritten. A pack contributes to this page as data and never as code, through a
// descriptor at `packs/<id>/dashboard.json`. Publishing is the `publish-pages` task plus the
// four-step workflow `seedOps` writes below; what a repo does with the pack is its README.
export default {
  version: '60922.3',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'the browser dashboard over Claudinite scheduler state and the site that publishes it',
    excludes: 'how the scheduler behaves — core; workflow practice — git-github; product sites — public-website',
  },

  // Never fingerprinted. Nothing in a repo's shape implies wanting a dashboard, and a
  // scan that suspected one from the presence of a scheduler would suspect it in every
  // member on the fleet.
  seededByDefault: false,

  // The page renders the queue's state, so it reads the queue's own vocabulary and
  // anchor math out of the tasks pack's published `public/` — the one sanctioned
  // cross-pack import in the corpus. Declaring the dependency is what puts that pack
  // in a mount that carries this one.
  requires: ['claudinite-tasks'],

  // A page, not a practice — see the header.

  // ONE question, and it is the one thing this pack cannot pick for a repo: which
  // dashboard the deployment is. Everything else has a default that is right for nearly
  // every project — no canon reference, no exclusions — and is read as optional
  // throughout, an unset key meaning the default rather than a misconfiguration. The mode is not like that: both answers are ordinary, neither is
  // rarer, and guessing it wrong publishes a plausible-looking site covering the wrong
  // thing. So it is asked, and the build refuses to publish without it.
  //
  // config keys — `mode` is REQUIRED, the rest optional:
  //   mode        — "repo" (this repo's own page) or "fleet" (the overview); no default
  //   canonRepo   — the reference member mounts are compared against (fleet view)
  //   rosterUrl   — a roster artifact; more than one member makes the fleet the landing view
  //   repos       — an inline roster instead of a URL
  //   allowedOrigins — page origins allowed to call the exchange endpoint (defaults to
  //                    the redirectUri's origin, then to this owner's Pages host)
  //   workerName  — what the deployed endpoint is called (defaults per the task)
  //
  // The sign-in pair are REPOSITORY VARIABLES rather than config, since they are what an
  // owner sets while standing in the GitHub App's settings and the second is minted by a
  // deploy rather than authored — `CLAUDINITE_DASHBOARD_CLIENT_ID` and
  // `CLAUDINITE_DASHBOARD_EXCHANGE_URL`, both read by `deployment-config.mjs`. A
  // `clientId`/`exchangeUrl` still on a declaration is read as the fallback, so a
  // deployment configured before they existed keeps its button; the build says so once.
  //   owner       — whose repos the fleet view enumerates (defaults to this repo's owner)
  //   exclude     — repos it keeps out (defaults to none)
  questions: [
    {
      id: 'mode',
      prompt: 'Is this deployment this repo\'s OWN dashboard, or the fleet overview across many repos? A fleet deployment also needs to name where its members come from — an "owner" whose repos are enumerated in the browser as the viewer (the one to prefer), or an explicit "repos" list or roster artifact.',
      distill: 'set config.mode to "repo" or "fleet" — there is no default and the build refuses to publish without it; a "fleet" answer must come with a roster source (owner/repos/rosterUrl), and a "repo" answer with none',
    },
  ],

  // The one step adoption CANNOT take, stated where the install flow can print it and
  // the adopting session can file it. Enabling Pages is a repository setting, and
  // `actions/configure-pages`' own `enablement` input cannot do it with the Action's
  // `GITHUB_TOKEN` — it needs a PAT with `repo`, or an app with `administration:write`.
  // Holding a credential that wide, in every member, to save one click is a far worse
  // trade than naming the click. So it is named.
  //
  // In a README this would be met after the first publish had already parked; here it
  // arrives at the moment someone is present and the pack is new.
  adoptionHandover: [
    {
      step: 'Enable GitHub Pages with source "GitHub Actions" — this repo\'s /settings/pages',
      breaks: 'the publish-pages task pushes the build, and its deploy run then fails — the task parks at needs-human-action naming this',
      done: 'the Pages URL serves the dashboard, and a publish-pages run converged done',
    },
    // ONE entry, not the dozen mechanical steps, because a `step` becomes one checkbox
    // in somebody's handover issue and spelling them here would put a registration, two
    // variables, two secrets and a deploy inside one box (basics'
    // `writing-handover-issues`). The mechanics live in the README, read at the moment
    // the adopter is standing in the settings page.
    //
    // Not a decision any more, and not optional: signing in is the only route to a
    // credential, so a deployment whose owner has not done this publishes a page that
    // tells every viewer it is unfinished.
    {
      step: 'Turn on Sign in with GitHub — the pack README\'s "Turning sign-in on" is that checklist.',
      breaks: 'nobody can read the dashboard at all: sign-in is the only way in, so until the pair is set the page '
        + 'shows its gate saying this deployment is not finished being set up, naming the two variables',
      done: 'a signed-in viewer sees the rate pill read “…/5000 · user”',
    },
  ],

  // Seeded, never converged: `.github/workflows/` cannot be written by the nightly, so
  // this arrives once, at adoption, and the repo owns it from there. Only `uses:` steps,
  // for exactly that reason — the part that cannot be updated holds nothing to update.
  seedOps: [
    {
      template: 'stubs/workflows/claudinite-dashboard-pages.yml',
      dest: '.github/workflows/claudinite-dashboard-pages.yml',
    },
  ],
};
