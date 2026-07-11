# Conformance checks

The deterministic-enforcement layer: corpus rules converted into machine-run checks, executed
when a session finishes (Stop hook) and in CI. Design and rationale → [DESIGN.md](DESIGN.md);
which rule came from which instruction → [conversion-inventory.md](conversion-inventory.md).
Dependency-free Node ≥ 18 — no install step.

## Running

```sh
node checks/run.mjs             # whole-repo sweep (the default — Stop hook and CI both run this)
node checks/run.mjs --changed   # transitional: only files changed vs the merge-base with main
node checks/run.mjs --list      # machine-readable rule catalog (id, severity, description, doc)
node checks/run.mjs --init      # write .claudinite-checks.json from the technology fingerprint

node --test checks/test/*.test.mjs skills/*/*.test.mjs   # the test suite, exactly as CI runs it
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

```json
{
  "packs": ["github-actions"],
  "rules": { "file-placement": "off" },
  "accept": [
    { "rule": "file-placement", "path": "src/shared/", "reason": "named cross-cutting concern" }
  ]
}
```

- **packs** — the declared technology packs; the closed set that executes (`universal` always
  runs and is never declared). The `pack-declaration` rule drift-guards this against the repo's
  actual technology fingerprint, both directions.
- **rules** — per-rule severity override: `"off"` / `"advisory"` / `"blocking"`.
- **accept** — reviewed, reasoned exemptions. `path` matches exactly, or a whole subtree when it
  ends with `/`; omit it to accept the rule everywhere. The `reason` is mandatory — a reasonless
  acceptance is itself a blocking finding.
- **maintenance** — fleet-maintenance delivery for this repo: `{ "delivery": "pr" }` makes the
  nightly fleet bootstrap sweep deliver its re-bootstrap/alignment changes as a never-merged PR
  instead of a direct push to the default branch (`"push"`, the default when the key is absent).
  Read by [routines/auto-fleet-bootstrap.md](../routines/auto-fleet-bootstrap.md); the checks
  engine itself ignores it.

## Enforcement wiring

- **Stop hook** ([stop-hook.mjs](stop-hook.mjs)) — registered in a repo's
  `.claude/settings.json` (see [bootstrap.md](../bootstrap.md)). Fast-exits when nothing changed
  vs the base; on blocking findings exits 2 so the session fixes them before stopping.
  Self-limiting: after blocking twice on identical findings it lets the stop through.
- **CI** — run `node checks/run.mjs` as the backstop for edits made outside Claude sessions;
  same sweep, same messages.

## Adding a rule

One module per rule under `../packs/<pack>/`, exporting
`{ id, severity, description, doc, why, run(ctx) }` — list it in that pack's
`../packs/<pack>/pack.mjs` manifest. The failure message *is* the instruction: `what` states the
violation, `why` the one-line motivation, `fix` the exact remedy, `doc` the corpus doc that owns
the depth. Write the fixture test first and see it fail (`test/`, scratch git repos via
[test/helpers.mjs](test/helpers.mjs)) — a violating fixture must find, a clean one must not.
A new rule ships at its real severity, fail-fast: `blocking` when a finding is a defect to
fix, `advisory` only when the rule's own semantics are directional (a smell to judge). A whole
new pack is just a `../packs/<name>/` directory with a `pack.mjs` (its `id`, fingerprint
`detect`, `rules`, and optional `prose`) — [packs/registry.mjs](../packs/registry.mjs)
discovers it structurally, no list to edit.

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
