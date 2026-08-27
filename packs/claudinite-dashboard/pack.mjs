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
// member. `descriptor-usable` is the third check: it holds a descriptor to what the
// page's OWN reader accepts, which the JSON Schema beside it structurally cannot,
// because the failure is silent — a rejected descriptor renders as one apologetic line
// in someone else's browser and nothing goes red where the author is looking.
//
// TWO MORE CHECKS, AND A TASK, ALL THE DIGEST'S. `tasks/fleet-digest/` writes the fleet's
// dated morning brief that the fleet page reads (it moved here from the `claudinite-fleet-sheepdog`
// pack, which enumerated the fleet but never showed anyone the result). Its two checks
// live in its own folder because nothing else reads them: `digest-plain-text` holds the
// landed briefs to plain text — they are sent verbatim through a renderer that neither
// parses markdown nor keeps line breaks — and `dated-fixture-collision` keeps the
// task's own test fixtures out of the year range the fleet writes real briefs in.
//
// THE TASK IS NOT GATED, and that is the cost of declaring this pack: a repo that wants
// only the page gets the digest task too, and the task needs `FLEET_GITHUB_TOKEN` to
// read every repo under the owner. Without that secret the executor parks its item
// asking for one. The README says so where someone deciding to adopt will read it.
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
import { fleetTokenHandoverStep } from './tasks/fleet-digest/fleet-token.mjs';

export default {
  version: '60827.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'the browser dashboard over Claudinite scheduler state, the site that publishes it, and the fleet morning brief it reads',
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
  // Audits the landed briefs and the task's own fixtures as they stand, whatever this
  // session touched: a markdown brief that landed last week is just as unreadable in the
  // owner's inbox as one that landed today.

  // ONE question, and it is the one thing this pack cannot pick for a repo: which
  // dashboard the deployment is. Everything else has a default that is right for nearly
  // every project — a pasted token, no canon reference, no digests panel — and is read
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
  //   clientId    — GitHub App / OAuth App client id, for the sign-in button
  //   exchangeUrl — the code-to-token endpoint that sign-in needs
  //   digestsRepo — where the fleet's morning briefs are written; unset turns that panel off
  //   digestsPath — the directory inside it (defaults to `digests`)
  //   owner       — whose repos the fleet-digest task covers (defaults to this repo's owner)
  //   exclude     — repos it keeps out (defaults to none)
  //   digest      — { pick, nudge } — how many items a brief names, and the quiet-project prod
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
      step: 'Enable GitHub Pages on this repo with source "GitHub Actions" (Settings → Pages).',
      breaks: 'the deploy job fails on every run; the build still succeeds, so nothing else is affected',
      done: 'the Pages URL serves the dashboard, and the Claudinite dashboard workflow is green',
    },
    // The fleet-digest task's credential, and a person is the only one who can mint it.
    // RENDERED from the task's own fleet-token.mjs rather than written here, so the
    // human granting it is handed the complete list: a message stating only what the
    // read in front of it needed is how a fleet went two days short one permission
    // (#1030).
    fleetTokenHandoverStep(),
    // ONE entry, not the four mechanical steps, because for many deployments the right
    // answer is "nothing" — a member's own dashboard read with a pasted token is on the
    // same 5,000/hour as a signed-in one. What every adopter does have to meet is the
    // DECISION, since until someone makes it their page reads GitHub anonymously; four
    // unconditional checkboxes that are mostly no-ops teach the reader to skim exactly
    // the list that exists to stop them skimming. The mechanics live in the README,
    // where they are read at the moment the answer is yes.
    {
      step: 'Decide how this dashboard authenticates its viewers: leave it on the pasted-token box (nothing to do), '
        + 'or give it a Sign in button — register a GitHub App with read-only Contents, Issues and Actions, install it on '
        + 'the account holding these repos, deploy the pack\'s oauth-exchange example, and set `clientId` and `exchangeUrl` '
        + 'on this pack\'s declaration. See "Who has to register the app" in the pack README: one App serves every '
        + 'deployment you own, and none can be inherited from another owner.',
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
