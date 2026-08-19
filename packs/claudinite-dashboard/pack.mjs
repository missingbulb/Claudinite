// claudinite-dashboard — a browser view of what a repo's (or a fleet's) Claudinite
// scheduler is doing, published as a static site.
//
// WHY A PACK AND NOT ENGINE CODE. The dashboard is not part of running the scheduler:
// nothing converges, ticks or executes because it exists, and a member that never
// looks at it should not carry it. Engine code is what every member runs; this is
// content a member OPTS INTO, and adoptable content in this corpus is a pack. That
// also buys it the things a pack has and engine code does not — its own version and
// migration lane, a declaration that gates it, and an adoption moment at which its
// deployment can be wired.
//
// WHAT IT READS. Only the queue's own vocabulary and the task declarations at HEAD,
// through the engine modules that define them (`../../engine/scheduler/queue/*`), so
// the page cannot drift from the mechanism it renders. Those relative paths resolve
// identically in the canon (`packs/<id>/` beside `engine/`) and in a member's mount
// (`.claudinite/shared/packs/<id>/` beside `.claudinite/shared/engine/`), which is
// why the pack can be read straight out of the mount with nothing rewritten.
//
// NO CHECKS, NO PROSE. It enforces nothing and there is no way to write the dashboard
// wrongly in a consuming repo — it is a page, not a practice. Prose here would cost
// every session in every declaring repo tokens for something no session acts on, so
// its README carries the explanation instead and `prose` stays null.
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
// the engine's tick. So the assembly logic keeps converging with the canon while the
// workflow — the part that cannot converge — stays a one-time seed. Only the file that
// has to be frozen is frozen.
export default {
  id: 'claudinite-dashboard',
  version: 5,
  minEngineVersion: 4,
  ruleRoutingGuidance: {
    belongs: 'the browser dashboard over Claudinite scheduler state, and the static site that publishes it',
    excludes: 'how the scheduler behaves — core; workflow practice — github-actions; product sites — static-website',
  },
  badge: 'badge.svg',

  // Never fingerprinted. Nothing in a repo's shape implies wanting a dashboard, and a
  // scan that suspected one from the presence of a scheduler would suspect it in every
  // member on the fleet.
  detect: null,
  marker: null,
  seededByDefault: false,

  // A page, not a practice — see the header.
  prose: null,
  worldRules: [],
  workRules: [],

  // Nothing to ask. Every fork this pack has is answered by a default that is right for
  // nearly every project: a member's dashboard shows that member, signs in with a
  // pasted token, and compares against no canon. The fleet deployment — one repo, not
  // twelve — says so in its declaration's `config`, which is read as optional
  // throughout: an unset key is the default, never a misconfiguration.
  //
  // config keys, all optional:
  //   canonRepo   — the reference member mounts are compared against (fleet view)
  //   rosterUrl   — a roster artifact; more than one member makes the fleet the landing view
  //   repos       — an inline roster instead of a URL
  //   clientId    — GitHub App / OAuth App client id, for the sign-in button
  //   exchangeUrl — the code-to-token endpoint that sign-in needs
  //   digestsRepo — where the fleet's morning briefs are written; unset turns that panel off
  //   digestsPath — the directory inside it (defaults to `digests`)
  questions: [],

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
