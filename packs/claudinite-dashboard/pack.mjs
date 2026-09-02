// claudinite-dashboard — a browser view of what a repo's (or a fleet's) Claudinite
// scheduler is doing, published as a static site.
//
// WHY A PACK AND NOT ENGINE CODE. The dashboard is not part of running the scheduler:
// nothing converges, scheduler runs or executes because it exists, and a member that never
// looks at it should not carry it. Engine code is what every member runs; this is
// content a member OPTS INTO, and adoptable content in this corpus is a pack. That
// also buys it the things a pack has and engine code does not — its own version and
// migration lane, a declaration that gates it, and an adoption moment at which its
// deployment can be wired.
//
// WHAT IT READS. Only the queue's own vocabulary and the task declarations at HEAD,
// through the tasks pack's published `shared-code/`, so the page cannot drift from the
// mechanism it renders. Those relative paths resolve identically in the canon (`packs/<id>/`
// beside its siblings) and in a member's mount (`.claudinite/shared/packs/<id>/`), which is
// why the pack can be read straight out of the mount with nothing rewritten.
//
// NO PROSE. There is no way to write the dashboard wrongly in a consuming repo — it is
// a page, not a practice — and prose here would cost every session in every declaring
// repo tokens for something no session acts on. Its README carries the explanation
// instead and `prose` stays null.
//
// PACKS CONTRIBUTE TO THIS PAGE, as data and never as code. A pack ships a descriptor
// (`packs/<id>/dashboard.json`, found by path convention — nothing registers it) naming
// what it has to say; its values come either from its own generated file in the
// member's tree or from one of the two platform facts the page already reads for every
// member. `descriptor-usable`, this pack's one check, holds a descriptor to what the
// page's OWN reader accepts, which the JSON Schema beside it structurally cannot,
// because the failure is silent — a rejected descriptor renders as one apologetic line
// in someone else's browser and nothing goes red where the author is looking.
//
// PUBLISHING IS THE ADOPTION MOMENT. `.github/workflows/` is the one directory the
// nightly update can never push to (the Action's `GITHUB_TOKEN` is refused there), so
// a deploy workflow can only arrive by being SEEDED — written by the install flow and
// committed by the adopting session, which holds a credential the Action does not.
// Hence the `seedOps` entry: adopting the pack is what wires the Pages deploy, and
// the workflow is the member's from the moment it lands.
//
// THE BUILD SCRIPT DELIBERATELY IS NOT SEEDED. `build-site.mjs` lives in the pack and
// is read out of the mount by the seeded workflow, exactly as the scheduler stub reads
// the engine's scheduler run. So the assembly logic keeps converging with the canon while the
// workflow — the part that cannot converge — stays a one-time seed. Only the file that
// has to be frozen is frozen.

export default {
  version: '60902.13',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'the browser dashboard over Claudinite scheduler state and the site that publishes it',
    excludes: 'how the scheduler behaves — core; workflow practice — git-github; product sites — static-website',
  },

  // Never fingerprinted. Nothing in a repo's shape implies wanting a dashboard, and a
  // scan that suspected one from the presence of a scheduler would suspect it in every
  // member on the fleet.
  seededByDefault: false,

  // The page renders the queue's state, so it reads the queue's own vocabulary and
  // anchor math out of the tasks pack's published `shared-code/` — the one sanctioned
  // cross-pack import in the corpus. Declaring the dependency is what puts that pack
  // in a mount that carries this one.
  requires: ['claudinite-tasks'],

  // A page, not a practice — see the header.

  // ONE question, and it is the one thing this pack cannot pick for a repo: which
  // dashboard the deployment is. Everything else has a default that is right for nearly
  // every project — a pasted token, no canon reference — and is read
  // as optional throughout, an unset key meaning the default rather than a
  // misconfiguration. The mode is not like that: both answers are ordinary, neither is
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
  // In a README this would be met after the first deploy had already failed; here it
  // arrives at the moment someone is present and the pack is new.
  adoptionHandover: [
    {
      step: 'Enable GitHub Pages with source "GitHub Actions" — this repo\'s /settings/pages',
      breaks: 'the deploy job fails on every run; the build still succeeds, so nothing else is affected',
      done: 'the Pages URL serves the dashboard, and the Claudinite dashboard workflow is green',
    },
    // ONE entry, not the four mechanical steps, because for many deployments the right
    // answer is "nothing" — a member's own dashboard read with a pasted token is on the
    // same 5,000/hour as a signed-in one. What every adopter does have to meet is the
    // DECISION, since until someone makes it their page reads GitHub anonymously; four
    // unconditional checkboxes that are mostly no-ops teach the reader to skim exactly
    // the list that exists to stop them skimming. The mechanics live in the README,
    // where they are read at the moment the answer is yes — and a `step` becomes one
    // checkbox in somebody's handover issue, so spelling them here would put six
    // actions and a rationale inside one box (basics' `writing-handover-issues`).
    {
      step: 'Decide how this dashboard authenticates its viewers: leave it on the pasted-token box, or turn on '
        + 'Sign in with GitHub — the pack README\'s "Turning sign-in on" is that checklist.',
      breaks: 'nothing fails, but a viewer who has not pasted a token reads GitHub anonymously at 60 requests/hour per IP — '
        + 'which one fleet sweep exceeds, so the page serves cached data or empty rows until the hour rolls',
      done: 'a signed-in viewer sees the rate pill read “…/5000 · user”, or this repo has recorded that the token box is '
        + 'this deployment\'s answer',
    },
  ],

  // Seeded, never converged: `.github/workflows/` cannot be written by the nightly, so
  // this arrives once, at adoption, and the repo owns it from there. It is a thin shim
  // over `build-site.mjs` in the mount for exactly that reason — the part that cannot
  // be updated is kept as small as possible.
  seedOps: [
    {
      template: 'stubs/workflows/claudinite-dashboard-pages.yml',
      dest: '.github/workflows/claudinite-dashboard-pages.yml',
    },
  ],
};
