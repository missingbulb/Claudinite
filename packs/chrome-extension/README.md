# chrome-extension pack

Active when a `manifest.json` declares `manifest_version`. Carries MV3 gotcha prose (`RULES.md`), the release & Chrome-Web-Store standard (`RELEASE.md`), and the release conformance checks.

## Checks (hardcoded) — the release standard

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `cer/release-workflows` | four stubs call canon workflows | blocking |
| `cer/template-tokens` | no unreplaced `__TOKEN__` survives | blocking |
| `cer/version-sync` | manifest and package.json versions agree | blocking |
| `cer/release-layout` | release machinery + store artifacts present | blocking |
| `cer/permission-justifications` | every permission justified in listing | blocking |
| `cer/readme-sections` | README has Install + Releasing | blocking |

## Prose gotchas (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| MV3 worker paths must be root-absolute | prose |
| SetIcon needs imageData, not path | prose |
| Injected shared global: augment, not replace | prose |
| CDP-introspecting an MV3 worker traps | prose |
| JWT auth via launchWebAuthFlow id_token | prose |
| MV3 loads ES modules natively | prose |
| Silent token refresh needs prompt=none | prose |
| host_permissions does not bypass CORS | prose |

`RELEASE.md` is the release/store-publication contract (setup steps and the manual store actions) — its invariants are mostly enforced by the checks above.
