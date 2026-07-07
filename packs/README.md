# packs/ — the corpus content, active by declaration

Each `packs/<name>/` bundles a pack's **prose** (`RULES.md`, injected at session start when the pack is active) and its **checks** (run at every Stop and in CI). `universal` is always on; technology and project-class packs activate when declared in `.claudinite-checks.json` (bootstrap's `--init` seeds the declaration from a fingerprint). Discovery is structural — any `packs/<name>/pack.mjs` is a pack. Each pack's `README.md` lists its rules with a ≤5-word description and whether each is **hardcoded** (a check) or **prose**.

## Packs

| Pack | Active when | Checks | Prose rules |
|---|---|---|---|
| [universal](universal/README.md) | always | 9 | ~8 (working-discipline + task-lifecycle) |
| [github-actions](github-actions/README.md) | `.github/workflows/` | 6 | 0 |
| [chrome-extension](chrome-extension/README.md) | manifest_version manifest | 0 | 8 |
| [chrome-extension-release](chrome-extension-release/README.md) | `Release: *` workflow stubs (opt-in) | 7 | 0 (+ RELEASE contract) |
| [node](node/README.md) | root package.json | 0 | 2 |
| [aws-sam](aws-sam/README.md) | SAM template | 3 | 3 |
| [html](html/README.md) | declared | 0 | 1 |
| [flutter](flutter/README.md) | pubspec.yaml | 0 | 0 (stub) |
| [research-project](research-project/README.md) | declared (class) | 0 | 54 (14 sections) |

Activity-scoped practice prose lives in [../skills/](../skills/README.md), not in a pack.

## Corpus tally — checks vs prose

| | Count |
|---|---|
| **Hardcoded conformance checks** | **25** (9 universal + 6 github-actions + 7 chrome-extension-release + 3 aws-sam) |
| PreToolUse guard | 1 (remote-branch-delete) |
| Platform setting | 1 (squash-only) |
| **Prose rules** — packs + practice skills + baseline | **~150** |
| Prose — research-project playbook (class pack) | 54 |

**Ratio ≈ 25 hardcoded : ~150 prose ≈ 1 : 6** (~14% of rules mechanized). Read against the *convertible* subset instead of all rules, it's higher: the audit ([../checks/conversion-inventory.md](../checks/conversion-inventory.md)) found only ~45 rules have any static signature — the other ~105 are judgment, in-flight process, or runtime knowledge that *should* stay prose — and ~25 of that ~45 are now checks. The `prose-to-checks` sweep keeps working the remainder; its adversarial pass rejects candidates whose detection would false-positive (the two SAM YAML checks needed a structural parser to stay FP-free), so the yield is deliberately small and high-precision.
