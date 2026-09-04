# Conformance checks

The deterministic-enforcement layer: corpus rules converted into machine-run checks, executed
when a session finishes (Stop hook) and in CI. Design and rationale → [DESIGN.md](DESIGN.md);
which rule came from which instruction → [docs/conversion-inventory.md](../../docs/conversion-inventory.md).
Dependency-free Node ≥ 18 — no install step.

## Running

```sh
node engine/checks/check_the_world.mjs             # world scope: repo-state rules + settings diagnostics — runs in the test/CI flow
node engine/checks/check_the_work.mjs              # work scope: rules judging the current change — runs at the Stop hook (--transcript enables the conversation rules)
                                                   # the two are independent runners; each accepts --changed (transitional
                                                   # adoption-backlog scoping) and --base REF
node engine/checks/check_the_world.mjs --list      # machine-readable catalog of every rule, both scopes
node engine/checks/check_the_world.mjs --init      # write .claudinite-settings.json — the baseline plus the fingerprinted packs

node --test $(git ls-files '*.test.mjs')   # the test suite; CI sweeps the same files from its declared roots
```

Exit 1 when blocking findings exist; advisory findings never fail a run. In a consuming repo
the paths start with `.claudinite/`. The steady state is a repo at zero findings (or reviewed
acceptances); `--changed` exists only for adopting a repo with a backlog. **Base-ref note:**
delta rules (new suppression markers, commits referencing an issue) and `--changed` scoping
diff against the merge-base with `origin/main` (falling back to `origin/master`, `main`,
`master`) — and a stale `origin/main` widens that delta, billing the base branch's own
commits to the work. So each run **refreshes that ref first** (one `git fetch` of the base
branch into its remote-tracking ref — no local branch, index, or working tree is touched).
It is best-effort and bounded: no network, no remote, or an unresponsive server and the run
continues against the ref as it stands (~10ms to fail, 8s ceiling when a server accepts and
stalls; ~0.3s when it succeeds). `CLAUDINITE_CHECKS_NO_FETCH=1` skips it — for a sealed
sandbox, or to pin the base deliberately. `squash-merge-history` is one of these delta
rules: it scopes to the merge commits the current change introduces since that merge-base,
not the repo's whole history, and a merge already on the base branch is filtered out even
when a criss-cross or shallow-clone merge-base leaves it inside that range.

**Stale-mount note:** a stale mount can likewise surface a spurious finding that an
already-merged canon fix would skip — the mount is refreshed by the SessionStart sync hook, so a
session that began before the fix landed still runs the older rules. Before committing a
workaround for a finding (an `accept` subtree, a suppression pragma), re-run the sync hook and
re-check: when the fix is known to have landed upstream, a stale mount is the likelier cause than
a real violation.

**Vendored/generated files are out of the sweep.** Files git marks `linguist-vendored` or
`linguist-generated` in `.gitattributes` — recorded third-party fixtures, machine-written
output — are not the project's own code, so the engine drops them from the default file set and
**every** check skips them (no per-rule `accept` needed). Mark a subtree vendored/generated
rather than accepting each finding it triggers. The one exception is `generated-merge-driver`,
which reasons *about* generated files and so still inspects them.

## Configuration — `.claudinite-settings.json` (repo root)

The declaration is **pack-oriented**: a `packs` entry is a pack id string, or an entry object
carrying that pack's own settings — its parameters, and the overrides/exemptions that exist
*because* the pack is declared:

```json
{
  "packs": [
    "baseline",
    { "id": "an-edge-graph-pack",
      "config": { "rules": [ { "from": "src", "to": "tests" } ] },
      "rules": { "some-rule": "advisory" },
      "accept": [ { "rule": "a-rule", "path": "src/shared/", "reason": "..." } ] },
    { "id": "a-framework-pack", "via": ["the-class-pack-requiring-it"] }
  ],
  "rules": { "a-rule": "off" },
  "accept": [
    { "rule": "a-rule", "path": "src/shared/", "reason": "named cross-cutting concern" }
  ],
  "maintenance": { "delivery": "auto-merge" }
}
```

- **packs** — the declared packs; the closed set that executes. **No pack runs undeclared** —
  the baseline too is declared explicitly (`--init` seeds it; the nightly
  the update flows backfill a missing declaration). A declared id may name a **canon** pack (mounted from
  `.claudinite/packs/`) or one of the repo's **own local packs** (`.claudinite/local/packs/<id>/` —
  discovered from the repo's own tree, `local: true`); both are declared and gated identically. A
  local pack's canonical declaration token is **namespaced**: `"local/<id>"` (string entry, or
  an entry object's `id`) — self-documenting, and a canon id can never be claimed by accident. The
  engine resolves both forms to the bare id ([`packEntryId`](../pack_loader/pack-registry.mjs)), so a bare local
  id still activates while the fleet migrates (the update flows rewrite it; the `local-pack-namespace`
  baseline migration tracks convergence). An
  **unknown** pack name — one that matches neither a canon nor a local pack — is a settings error,
  caught at load (see below); a broken or id-colliding local pack.mjs is likewise surfaced as a
  blocking `config` finding, never a silent drop. A pack's fingerprint only *suspects* it is wanted
  and never forces or forbids its declaration (a local pack is never fingerprinted or seeded — it is
  always declared by hand). An entry object carries:
  - **id** — the pack name (required; a bare string entry is shorthand for `{ "id": ... }`).
  - **config** — the pack's parameters (e.g. the dirs a technology pack's `npm ci` runs in, an
    edge-graph pack's edge list). This is the home of what a legacy top-level `packConfig` key
    used to hold — the engine still reads that key, but baselining folds it into the entries
    and nothing should keep authoring it. The `pack-entry-config` baseline migration
    ([engine/migrations/](../migrations/README.md)) documents the fold; once the fleet is off the
    old shape, the key stops being a valid setting.
  - **answers** — the pack's adoption-interview answers, **verbatim**, keyed by question id
    (`{ "<question-id>": "<answer>" }`). A pack declares its questions on its `pack.mjs`; the
    unanswered gap surfaces only as a mild SessionStart note (strict solely inside the bootstrap
    adoption flow), never a conformance finding —
    [packs/README.md](../../packs/README.md#adoption-interview-questions). A stored answer whose
    question the pack no longer declares is an *advisory* `config` finding.
  - **rules** / **accept** — severity overrides and acceptances **motivated by declaring this
    pack**; they may name *any* rule (declaring pack A can require an exemption to pack B's
    check), and the entry is their provenance — the file says which declaration required which
    exception. Same shapes as the top-level keys; entry-sourced acceptances surface with the
    pack named. Two sources disagreeing on a rule's severity is a settings error, never a
    silent last-writer-wins.
  - **via** — written by the engine (never by hand) when a dependency is materialized:
    the declared packs that directly require this one, kept accurate by the update
    backfill (an empty recomputed `via` marks an orphan the project can drop).
- **rules** — per-rule severity override: `"off"` / `"advisory"` / `"blocking"`. The top-level
  key holds project-wide overrides and those for skill-owned checks (which run
  pack-independently, so no pack entry can carry them).
- **accept** — reviewed, reasoned exemptions. `path` matches exactly, or a whole subtree when it
  ends with `/`; omit it to accept the rule everywhere. The `reason` is mandatory — a reasonless
  acceptance is itself a blocking finding. The top-level key holds project-origin exemptions (the
  project's own layout is the reason) — an exemption a *pack's adoption* forces belongs on that
  pack's entry.
- **maintenance** — scheduled-task PR delivery for this repo, **always explicit**: `"delivery":
  "auto-merge"` (a `pr` task's automerge-authorized PR — the `claudinite/maintenance` converge, growth-extract's
  lesson capture, the usage folds — lands itself once this repo's checks pass, no human review) or
  `"review"` (those same PRs, left for the owner to review — never auto-merged; every such task's
  automerge degrades to `nothing`, member config wins). Neither is a direct commit to the default
  branch. (`push`/`auto`/`pr` are accepted as legacy aliases for `auto-merge`/`review`.) There is
  deliberately no
  implicit default — `--init` seeds `auto-merge` and the nightly sweep backfills a missing key, so the
  selection is visible in this file rather than implied by absence. Read by the shared delivery
  helper every PR-delivering task lands through (the shared landing helper and its `deliver-pr` procedure),
  never by a task itself; the checks engine ignores it.

## Enforcement wiring

The two scopes fire at **different times**, because they answer different questions — one about
the change in front of the session, one about the repo as a whole:

- **Work scope → the Stop hook.** A repo's `.claude/settings.json` wires the stable
  [../hooks/stop-command.mjs](../hooks/stop-command.mjs) (see [bootstrap.md](../../bootstrap.md)),
  which fast-exits when nothing changed vs the base and otherwise runs
  [check_the_work.mjs](check_the_work.mjs) with the session transcript — the per-turn feedback
  loop, judging what the session just did (and the conversation-surface rules, which only exist
  at Stop). On blocking findings it exits 2 so the session fixes them before stopping.
  Self-limiting: after blocking twice on identical findings it lets the stop through.
- **World scope → the project's test/CI flow.** The whole-repo sweep is a repo-wide invariant
  assertion — the same kind of thing a test suite is — and is only *meaningful* at a
  commit/verify boundary, not every turn. So [check_the_world.mjs](check_the_world.mjs) is wired
  in as its own step wherever the project runs its tests (a CI job, a `make test` target, an npm
  script), invoked as the standalone `node …/check_the_world.mjs` command — **not** a
  language-specific test file, since a non-Node consumer's runner can't load one. Bootstrap wires
  this step during adoption, adding a minimal flow where the repo has none
  ([bootstrap.md](../../bootstrap.md)). This **supersedes** the earlier #385 stance ("no CI job;
  edits outside sessions surface at the next Stop sweep") — the world sweep now has a deterministic
  home in the test/CI flow rather than riding every Stop.

## Adding a rule

One module per rule under `../packs/<pack>/worldRules/` (audits the repo as it stands) or
`../packs/<pack>/workRules/` (judges the change in front of you), default-exporting
`{ id, severity, description, doc, why, run(ctx) }`. The directory is the declaration —
there is no manifest line to add. The failure message *is* the instruction: `what` states the
violation, `why` the one-line motivation, `fix` the exact remedy, `doc` the corpus doc that owns
the depth. Write the fixture test first and see it fail — each pack carries one
`<pack>/test/pack.test.mjs`, inside the pack's own `test/` directory (which no vendor set ships), sharing the scratch-git-repo harness
[engine-tests/helpers.mjs](../../engine-tests/helpers.mjs); a violating fixture must find, a clean one must not.
A new rule ships at its real severity, fail-fast: `blocking` when a finding is a defect to
fix, `advisory` only when the rule's own semantics are directional (a smell to judge).

**A blocking rule may declare `since` — the date it was added — and is then enforced as
advisory for its first two weeks** (`GRACE_DAYS` in [helpers/findings.mjs](helpers/findings.mjs)),
after which it bites. That is what lets a rule land against a tree that still violates it:
the backlog it surfaces gets two weeks to be cleared, the rule tightened, or the rule deleted
as a bad idea, without the authoring PR having to carry the cleanup. Findings inside the window
print the date the rule starts blocking. A rule with no `since` has no grace — absence means
mature, never newborn — and a `since` in the future grants nothing, since a date far enough out
would be a suppression wearing a creation date. A project that sets the rule to `blocking` in
its own settings overrides the grace and gets enforcement from day one. The window is measured from the
declared date, not from the day a consumer received the rule — so a canon rule's grace is spent by the time
a member converges onto it, and a rule going out to the fleet still has to be one the fleet can satisfy. A whole
new pack is just a `../packs/<name>/` directory with a `pack.mjs` (its fingerprint `detect` and its
rules; the id, prose, badge and bundled skills come from the directory itself) —
[engine/pack_loader/pack-registry.mjs](../pack_loader/pack-registry.mjs) discovers it structurally,
no list to edit.

**Prefer a declaration over code.** A rule whose whole logic is "these patterns over these
files" — a required or forbidden regex, a pattern pair, a repo-level implication — is declared as
data, and data is JSON, not a module: a pack's declarations are the array in
`../packs/<pack>/declared-checks.json`, a skill's in its own `declared-checks.json`, both discovered
structurally by the registry and compiled by [pattern-rules.mjs](helpers/pattern-rules.mjs) (the spec
vocabulary is documented in that helper's header). Nothing wires them — no import, no manifest line;
writing the declaration adds the check. One file to read for a pack's declared surface, and a format
that admits no comments and no `doc` pointer, so a declaration carries its own case: `id`,
`severity`, the optional `since` above, the `failureMessage` every finding prints, and the
assertions with their `what`/`fix`.
Regexes are strings in `/pattern/flags` form. A rule needing a hand-written `run(ctx)` stays its own
module, listed in the manifest as before. The engine runs every pattern rule in
ONE shared pass — each file read once, its lines walked once for all subscribing rules — so a
declared rule costs nothing extra however many exist. Reach for a hand-written `run(ctx)` only
when the check needs what patterns can't say: real parsing (balanced braces, HTML attributes,
TOML), git/diff/conversation state beyond the work assertions, or a cross-file comparison the
two-pass keys cannot state (`extractValueSets` derives a named set from lines, paths or parsed
fields; `checkSetValues`, `checkSetPairs` and `requireIdenticalFiles` quantify over it).

**Prefer a schema over a declaration for a document's shape.** A rule that a JSON document must carry a
field, take a value from a closed set, have a type, or carry nothing beyond a key set is a property of the
JSON Schema the document points at with `"$schema": "<repo-relative path>"` — one place, read by the editor
as the document is written and enforced by the `schema-conformance` check for every such document at once
([helpers/json-schema.mjs](helpers/json-schema.mjs) validates the draft-2020 subset the corpus's schemas use).
A `checkParsedFiles` assertion over a field is a schema check in disguise; reach for it only where a schema
cannot say what the rule says — a relation between two documents, a value that depends on the tree.

**Shared helpers carry mechanism, not policy.** A `engine/checks/helpers/` helper owns only the walking —
resolve a file set, find the lines a pattern matches, list the change's added lines
([helpers/line-scanning.mjs](helpers/line-scanning.mjs)), evaluate declared pattern specs in one pass
([helpers/pattern-rules.mjs](helpers/pattern-rules.mjs)) — never one rule's forbidden tokens, file filters, or failure
text; those stay in the rule module, which composes the helpers in a few lines. A lib that knows
a rule's words is that rule's policy wearing an engine filename: unreusable by the next rule and
a second place for the first one to drift from.

**A check that validates one skill's action lives with that skill**, inside its owning pack:
drop the rule module and a `checks.mjs` (default export = an array of rules) in the skill's own
`<pack>/skills/<name>/`, keep its test beside it, and the pack registry gathers it onto the pack
(`skillChecks`), run when the pack is active. **But relevance still isn't free.** The pack gate
only says the project opted into the pack — not that this skill's action ever happened in this
repo — so `run(ctx)` must still **detect relevance first, cheaply and specifically, and
return `[]` when the artifact is absent** (`routine-structure` keys off a `routine.md` existing
before it asserts anything). Getting this wrong doesn't cost a little — it fires false findings
on every unrelated repo the corpus is mounted in, so make the relevance signal narrow and put it
at the top of `run`.

**Settings validity is not a conformance check — it's validated when the file loads.**
[`loadConfig`](helpers/repo-context.mjs) reports malformed JSON and an unknown top-level property; the runner adds
an unknown *pack name* (only it holds the registry). Each surfaces as a blocking `config` error, because a
wrong pack name is as much a settings error as invalid JSON. This deliberately replaced a `pack-declaration`
conformance check: whether a repo declares a pack its fingerprint suggests, or drops one whose marker is
gone, is the **project's** call — a `marker` is a way to *suspect* a pack is needed, never proof it must (or
must not) be declared — so the checker no longer second-guesses it.

Pack **dependencies** are likewise *not* a check: a pack can't be imported without the packs it requires, so
[`resolveDeclaredPacks`](../pack_loader/pack-registry.mjs) pulls each declared pack's `requires` closure into the
declaration when it is written (bootstrap `--init` and the update backfill), materializing the
prerequisite in `.claudinite-settings.json` rather than flagging its absence after the fact.
