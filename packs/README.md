# packs/ — the corpus content, active by declaration

Each `packs/<name>/` bundles a pack's **prose** (`RULES.md`, injected at session start when the pack is active) and its **checks** (run at every Stop and in CI). **No pack is active by default** — every pack, the `universal` baseline included, activates only when declared in `.claudinite-checks.json` (bootstrap's `--init` seeds `universal` plus the fingerprinted technology packs; the nightly re-bootstrap backfills the explicit `universal` declaration into existing consumers). Discovery is structural — any `packs/<name>/pack.mjs` is a pack. Each pack's `README.md` lists its rules with a ≤5-word description and whether each is **hardcoded** (a check) or **prose**.

## Packs

| Pack | Active when | Checks | Prose rules |
|---|---|---|---|
| [universal](universal/README.md) | declared (seeded by `--init`) | 9 | ~8 (working-discipline + task-lifecycle) |
| [github-actions](github-actions/README.md) | `.github/workflows/` | 6 | 0 |
| [chrome-extension](chrome-extension/README.md) | manifest_version manifest | 0 | 8 |
| [chrome-extension-release](chrome-extension-release/README.md) | `Release: *` workflow stubs (opt-in) | 7 | 0 (+ RELEASE contract) |
| [node](node/README.md) | root package.json | 0 | 2 |
| [aws-sam](aws-sam/README.md) | SAM template | 3 | 3 |
| [html](html/README.md) | declared | 0 | 1 |
| [flutter](flutter/README.md) | pubspec.yaml | 0 | 0 (stub) |
| [research-project](research-project/README.md) | declared (class) | 0 | 54 (14 sections) |
| [spec-driven-product](spec-driven-product/README.md) | declared (class) | 0 | 25 (8 sections) |

Activity-scoped practice prose lives in [../skills/](../skills/README.md), not in a pack.

## Environment requirements (`env`)

A pack may declare a toolchain (or per-repo deps) a cloud session needs but the Claude Code Web base image doesn't ship — the `flutter` pack needs the Flutter SDK; the `node` pack needs the repo's `npm` modules. Install belongs in the environment **image** (built once, snapshotted, reused), never a per-session hook. A pack declares it in an optional `env` field on its `pack.mjs`:

```js
env: {
  label: 'Flutter SDK',                         // human name for the check's messages
  setup: '<bash>',                              // idempotent install fragment for the image
  probe: 'command -v flutter >/dev/null 2>&1',  // exit 0 iff present in the running env
}
```

`setup` and `probe` may be a **string**, or a **function of the project's per-pack params** — a project supplies parameters about its own usage in `.claudinite-checks.json` under `packConfig`, so one pack fragment fits every repo. The `node` pack uses this for where `npm ci` runs:

```js
// packs/node/pack.mjs
setup: (p) => (p.dirs?.length ? p.dirs : ['.']).map((d) => `( cd "${d}" && npm ci ) || true`).join('\n'),
// a repo's .claudinite-checks.json: { "packConfig": { "node": { "dirs": ["firebase/functions"] } } }
```

[`env.mjs`](env.mjs) drives everything from the repo's **active** packs (same activation as prose/checks):

- `node .claudinite/packs/env.mjs install` runs every active pack's `setup` in the checkout. The corpus's one generic [`environment-setup.sh`](../environment-setup.sh) (synced into every consumer's `.claudinite/`) calls this after syncing the corpus.
- `node .claudinite/packs/env.mjs check` is a SessionStart hook (web only) that **asserts** — it runs each `probe` directly against the running environment and injects the halt-gate context if a requirement is missing. No version flag: the probes are the source of truth, and a genuinely new requirement fails its probe and prompts a re-run. Never installs.
- `node .claudinite/packs/env.mjs plan` prints what `install` would run (review / debug).

Wiring a consumer up — the check hook + `packConfig`, with the script pasted from the corpus copy — is [bootstrap.md](../bootstrap.md) Part 8. A pack with no `env` field adds nothing; universal git hygiene lives in the generic script, not a pack.

## Corpus tally — checks vs prose

| | Count |
|---|---|
| **Hardcoded conformance checks** | **25** (9 universal + 6 github-actions + 7 chrome-extension-release + 3 aws-sam) |
| PreToolUse guard | 1 (remote-branch-delete) |
| Platform setting | 1 (squash-only) |
| **Prose rules** — packs + practice skills + baseline | **~150** |
| Prose — research-project playbook (class pack) | 54 |
| Prose — spec-driven-product playbook (class pack) | 25 |

**Ratio ≈ 25 hardcoded : ~150 prose ≈ 1 : 6** (~14% of rules mechanized). Read against the *convertible* subset instead of all rules, it's higher: the audit ([../checks/conversion-inventory.md](../checks/conversion-inventory.md)) found only ~45 rules have any static signature — the other ~105 are judgment, in-flight process, or runtime knowledge that *should* stay prose — and ~25 of that ~45 are now checks. The `prose-to-checks` sweep keeps working the remainder; its adversarial pass rejects candidates whose detection would false-positive (the two SAM YAML checks needed a structural parser to stay FP-free), so the yield is deliberately small and high-precision.
