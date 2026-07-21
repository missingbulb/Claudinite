# Conformance checks

The deterministic-enforcement layer: corpus rules converted into machine-run checks, executed
when a session finishes (Stop hook) and in CI. Design and rationale → [DESIGN.md](DESIGN.md);
which rule came from which instruction → [../docs/conversion-inventory.md](../docs/conversion-inventory.md).
Dependency-free Node ≥ 18 — no install step.

## Running

```sh
node checks/run.mjs             # whole-repo sweep (the default — Stop hook and CI both run this)
node checks/run.mjs --changed   # transitional: only files changed vs the merge-base with main
node checks/run.mjs --list      # machine-readable rule catalog (id, severity, description, doc)
node checks/run.mjs --init      # write .claudinite-checks.json — the baseline plus the fingerprinted packs

node --test checks/test/*.test.mjs packs/*.test.mjs packs/*/*.test.mjs skills/*.test.mjs skills/*/*.test.mjs   # the test suite, exactly as CI runs it
```

Exit 1 when blocking findings exist; advisory findings never fail a run. In a consuming repo
the paths start with `.claudinite/`. The steady state is a repo at zero findings (or reviewed
acceptances); `--changed` exists only for adopting a repo with a backlog. **Base-ref note:**
delta rules (new suppression markers, commits referencing an issue) and `--changed` scoping
diff against the merge-base with `origin/main` (falling back to `origin/master`, `main`,
`master`) — a stale `origin/main` widens that delta, so fetch when findings look like they
aren't yours. `squash-merge-history` is one of these delta rules: it scopes to the merge
commits the current change introduces since that merge-base, not the repo's whole history.

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

## Configuration — `.claudinite-checks.json` (repo root)

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
  "maintenance": { "delivery": "auto" }
}
```

- **packs** — the declared packs; the closed set that executes. **No pack runs undeclared** —
  the baseline too is declared explicitly (`--init` seeds it; the nightly
  baselining backfills a missing declaration). A declared id may name a **canon** pack (mounted from
  `.claudinite/packs/`) or one of the repo's **own local packs** (`.claudinite/local_packs/<id>/` —
  discovered from the repo's own tree, `local: true`); both are declared and gated identically. A
  local pack's canonical declaration token is **namespaced**: `"local_packs/<id>"` (string entry, or
  an entry object's `id`) — self-documenting, and a canon id can never be claimed by accident. The
  engine resolves both forms to the bare id ([`packEntryId`](../packs/registry.mjs)), so a bare local
  id still activates while the fleet migrates (baselining rewrites it; the `local-pack-namespace`
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
    ([migrations/](../migrations/README.md)) tracks the fleet's convergence; when it retires,
    the key stops being a valid setting.
  - **answers** — the pack's adoption-interview answers, **verbatim**, keyed by question id
    (`{ "<question-id>": "<answer>" }`). A pack declares its questions on its `pack.mjs`; the
    unanswered gap surfaces only as a mild SessionStart note (strict solely inside the bootstrap
    adoption flow), never a conformance finding —
    [packs/README.md](../packs/README.md#adoption-interview-questions). A stored answer whose
    question the pack no longer declares is an *advisory* `config` finding.
  - **rules** / **accept** — severity overrides and acceptances **motivated by declaring this
    pack**; they may name *any* rule (declaring pack A can require an exemption to pack B's
    check), and the entry is their provenance — the file says which declaration required which
    exception. Same shapes as the top-level keys; entry-sourced acceptances surface with the
    pack named. Two sources disagreeing on a rule's severity is a settings error, never a
    silent last-writer-wins.
  - **via** — written by the engine (never by hand) when a dependency is materialized:
    the declared packs that directly require this one, kept accurate by the baselining
    backfill (an empty recomputed `via` marks an orphan the project can drop).
- **rules** — per-rule severity override: `"off"` / `"advisory"` / `"blocking"`. The top-level
  key holds project-wide overrides and those for skill-owned checks (which run
  pack-independently, so no pack entry can carry them).
- **accept** — reviewed, reasoned exemptions. `path` matches exactly, or a whole subtree when it
  ends with `/`; omit it to accept the rule everywhere. The `reason` is mandatory — a reasonless
  acceptance is itself a blocking finding. The top-level key holds project-origin exemptions (the
  project's own layout is the reason) — an exemption a *pack's adoption* forces belongs on that
  pack's entry.
- **maintenance** — fleet-maintenance delivery for this repo, **always explicit**: `"delivery":
  "auto"` (the sweep lands its baselining/alignment changes through the `claudinite/maintenance` PR,
  armed to **auto-merge** once this repo's checks pass — no human review) or `"review"` (that same
  PR, left for the owner to review — never auto-merged). Neither is a direct commit to the default
  branch. (`push`/`pr` are accepted as legacy aliases for `auto`/`review`.) There is deliberately no
  implicit default — `--init` seeds `auto` and the nightly sweep backfills a missing key, so the
  selection is visible in this file rather than implied by absence. Read by
  the baselining worker; the checks engine
  itself ignores it.

## Enforcement wiring

- **Stop hook** ([stop-hook.mjs](stop-hook.mjs)) — registered in a repo's
  `.claude/settings.json` (see [bootstrap.md](../bootstrap.md)). Fast-exits when nothing changed
  vs the base; on blocking findings exits 2 so the session fixes them before stopping.
  Self-limiting: after blocking twice on identical findings it lets the stop through.
- **No CI job in the standard wiring** — edits made outside Claude sessions surface at the next
  session's Stop sweep (owner decision, #385). A repo that wants a CI backstop can run
  `node checks/run.mjs` itself; same sweep, same messages.

## Adding a rule

One module per rule under `../packs/<pack>/`, exporting
`{ id, severity, description, doc, why, run(ctx) }` — list it in that pack's
`../packs/<pack>/pack.mjs` manifest. The failure message *is* the instruction: `what` states the
violation, `why` the one-line motivation, `fix` the exact remedy, `doc` the corpus doc that owns
the depth. Write the fixture test first and see it fail — each pack carries one
`../packs/<pack>/pack.test.mjs` beside the rules it proves, sharing the scratch-git-repo harness
[test/helpers.mjs](test/helpers.mjs); a violating fixture must find, a clean one must not.
A new rule ships at its real severity, fail-fast: `blocking` when a finding is a defect to
fix, `advisory` only when the rule's own semantics are directional (a smell to judge). A whole
new pack is just a `../packs/<name>/` directory with a `pack.mjs` (its `id`, fingerprint
`detect`, `rules`, and optional `prose`) — [packs/registry.mjs](../packs/registry.mjs)
discovers it structurally, no list to edit.

**Shared helpers carry mechanism, not policy.** A `checks/lib/` helper owns only the walking —
resolve a file set, find the lines a pattern matches, list the change's added lines
([lib/lines.mjs](lib/lines.mjs)) — never one rule's forbidden tokens, file filters, or failure
text; those stay in the rule module, which composes the helpers in a few lines. A lib that knows
a rule's words is that rule's policy wearing an engine filename: unreusable by the next rule and
a second place for the first one to drift from.

**A check that validates one skill's action lives with that skill**, not in a pack: drop the
rule module and a `checks.mjs` (default export = an array of rules) in `../skills/<name>/`, keep
its test beside it, and [skills/registry.mjs](../skills/registry.mjs) discovers it. **But a
skill check runs everywhere.** A technology-pack check only runs where the project *declared*
that pack; a skill check is never declared, so the engine runs it on every repo and every
sweep — including repos where the skill's action never happened. That declaration gate you don't
get, `run(ctx)` must supply itself: **detect relevance first, cheaply and specifically, and
return `[]` when the artifact is absent** (`routine-structure` keys off a `routine.md` existing
before it asserts anything). Getting this wrong doesn't cost a little — it fires false findings
on every unrelated repo the corpus is mounted in, so make the relevance signal narrow and put it
at the top of `run`.

**Settings validity is not a conformance check — it's validated when the file loads.**
[`loadConfig`](lib/context.mjs) reports malformed JSON and an unknown top-level property; the runner adds
an unknown *pack name* (only it holds the registry). Each surfaces as a blocking `config` error, because a
wrong pack name is as much a settings error as invalid JSON. This deliberately replaced a `pack-declaration`
conformance check: whether a repo declares a pack its fingerprint suggests, or drops one whose marker is
gone, is the **project's** call — a `marker` is a way to *suspect* a pack is needed, never proof it must (or
must not) be declared — so the checker no longer second-guesses it.

Pack **dependencies** are likewise *not* a check: a pack can't be imported without the packs it requires, so
[`resolveDeclaredPacks`](../packs/registry.mjs) pulls each declared pack's `requires` closure into the
declaration when it is written (bootstrap `--init` and the baselining backfill), materializing the
prerequisite in `.claudinite-checks.json` rather than flagging its absence after the fact.
