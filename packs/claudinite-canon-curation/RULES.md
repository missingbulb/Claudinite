# claudinite-canon-curation — authoring and policing the packs on a canon's shelf

## Naming and placing content on the shelf

- **Wanting a rule about what the `packs/` tree may reference** — configure the baseline pack's
  `config.barriers`, extending the mechanism generically if a capability is missing. Never
  standalone segregation-checking code. (12)

- **Naming a new canon pack** — name it for the surface it serves rather than the first feature
  you are building for it.

- **Naming a pack whose subject is a Claudinite feature itself** — the `claudinite-` prefix
  (`claudinite-lifecycle`, `claudinite-dashboard`). `claudinite-growth` is grandfathered.
  (convertible → prose-to-checks) (1)

- **Looking for a skill and not finding it in `.claude/skills/`** — read
  `packs/<pack>/skills/<name>/SKILL.md` out of the tracked tree. Mounting filters on the literal
  declaration, so an unmounted skill says nothing about whether its procedure applies. (2)

- **A canon pack's prose naming another pack by literal path** — check the name resolves inside
  every consumer's vendored tree.


## Pack config and shared logic

- **Choosing a value right for nearly every project** — keep it in the pack's own code: ask
  nothing at adoption, write nothing into member config. Read config as optional; unset means the
  default, never "misconfigured".

- **Wanting a `.claudinite-settings.json` entry's config validated** — a real JSON Schema the file
  points at with `$schema`. Never a coded per-pack validation vocabulary or a `configSchema` type
  system on the manifest. (4)

- **Wanting to share logic between two sibling packs** — never `engine/`, which breaks the
  package-manager model, and never a pack-to-pack dependency, which breaks independence. Prefer
  self-describing data; else duplicate, possibly with a drift guard. (5)

## Pack modules and the engine they load against

- **Adding a module under `packs/`** — keep it import-light, and start work after evaluation
  completes (`check(…).catch(…)`), never in a top-level `await`. Discovery imports every
  `pack.mjs` before activation is consulted, so a CLI entry point re-imports mid-evaluation and
  Node exits 13.


- **A pack that fails to load** — it fails the mount's self-test, the converge refuses to land at
  all, and the member cannot receive the pack version that would have fixed it.

## Writing and keeping checks

- **Adding or changing a check** — update the pack's catalog row, and re-run the suite against
  current `main` before merging: a whole-tree aggregate is judged post-merge, so a branch's own
  green never covers it.

- **Writing a check's `fix` text** — name only remedies matching the enforced severity; sessions
  follow the words, not the `severity` field. An advisory's remedies are act on it or leave it,
  never a config-acceptance escape.


- **Writing a check that reads the session transcript** — screen the harness's plain-text
  pseudo-turns, not only tag-wrapped ones. `humanText` in
  `engine/checks/helpers/session-transcript.mjs` drops an entry starting with `<`, so a marker
  like `[Request interrupted by user for tool use]` reads as the owner's latest comment. (6)

- **Fixturing a check that fires at the Stop hook** — carry an interruption marker beside a real
  owner turn. A false positive there spends a whole cycle on something no edit can clear. (7)

- **A doc reached only by following a link out of `RULES.md` or a check's `doc:` line** — if it is
  a how-to wanted at authoring time, convert it into a skill invocable by description.

- **Moving or renaming a file a check's `doc:` field points at** — grep for and re-verify every
  `doc:` by hand. Nothing opens the field until the check fires, so a stale pointer sits broken
  indefinitely.

- **A check built to catch a thing being missing or misnamed** — don't gate its relevance on the
  single signal it exists to validate, or the failure it catches also silences it. Use two
  independent signals, either sufficient. (8)

- **Finding a check that watches only one of two structurally-identical surfaces** — widen it to
  the sibling in the same change rather than filing it separately. (9)

- **Writing a check that selects inputs by path pattern** — assert over the real tree that its
  scope is non-empty. A pattern left behind by a layout change matches nothing, reads as live, and
  fixtures spelling the same dead layout keep proving the matching.

- **Naming a directory in a finding, a remedy or a doc pointer** — grep the tree for it before
  shipping.

- **Deciding whether an enforced check still earns its keep** — measure its blocking-firing rate
  against what it buys. A check whose firings are dominated by cases where the agent already did
  the right thing is a demotion candidate (check → prose-only). (10)

## Writing pack prose and skills

- **Writing anything into a pack's `RULES.md` that describes rather than instructs** — how a
  mechanism works, or what the pack's own tasks do — not there, where every session in every
  declaring repo pays for it whether or not it is that session's work. Description belongs in the
  module header and the pack `README.md`; a worker's policy belongs in the `task.md` it loads.

- **A documented multi-step procedure the agent re-derives every run** — mechanize it into a
  script the agent runs once. That pattern, not the doc's polish, is the signal.
