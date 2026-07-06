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
```

Exit 1 when blocking findings exist; advisory findings never fail a run. In a consuming repo
the paths start with `.claudinite/`. The steady state is a repo at zero findings (or reviewed
acceptances); `--changed` exists only for adopting a repo with a backlog. **Base-ref note:**
delta rules (new suppression markers, commits referencing an issue) and `--changed` scoping
diff against the merge-base with `origin/main` (falling back to `origin/master`, `main`,
`master`) — a stale `origin/main` widens that delta, so fetch when findings look like they
aren't yours.

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

## Enforcement wiring

- **Stop hook** ([stop-hook.mjs](stop-hook.mjs)) — registered in a repo's
  `.claude/settings.json` (see [bootstrap.md](../bootstrap.md)). Fast-exits when nothing changed
  vs the base; on blocking findings exits 2 so the session fixes them before stopping.
  Self-limiting: after blocking twice on identical findings it lets the stop through.
- **CI** — run `node checks/run.mjs` as the backstop for edits made outside Claude sessions;
  same sweep, same messages.

## Adding a rule

One module per rule under `packs/<pack>/`, exporting
`{ id, severity, description, doc, why, run(ctx) }` — register it in
[packs/packs.mjs](packs/packs.mjs). The failure message *is* the instruction: `what` states the
violation, `why` the one-line motivation, `fix` the exact remedy, `doc` the corpus doc that owns
the depth. Write the fixture test first and see it fail (`test/`, scratch git repos via
[test/helpers.mjs](test/helpers.mjs)) — a violating fixture must find, a clean one must not.
New rules ship `advisory` and are promoted to `blocking` after observed precision. A new
technology pack also registers its fingerprint in
[packs/fingerprints.mjs](packs/fingerprints.mjs) and flips `available: true`.
