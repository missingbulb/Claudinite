# chrome-extension-release pack

The release & Chrome-Web-Store publication standard for our extensions — the reusable workflows' contract, the setup steps, the manual store actions (`RELEASE.md`), the four workflow `stubs/`, and the conformance checks. **Opt-in**: a project declares it in `.claudinite-checks.json` when it's ready to ship (a `manifest.json` alone does not pull it in). Declaring it is the cue to scaffold the release machinery — the checks below drive creating the files, and setup opens the one-time first-publication issue.

Fingerprint: a repo already carrying the standard's `Release: *` workflow stubs. The `pack-declaration` drift guard uses it to keep the declaration honest (and to migrate a repo that shipped release before this pack existed).

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `cer/release-workflows` | four stubs call canon workflows | blocking |
| `cer/template-tokens` | no unreplaced `__TOKEN__` survives | blocking |
| `cer/version-sync` | manifest and package.json versions agree | blocking |
| `cer/release-layout` | privacy policy source present | blocking |
| `cer/privacy-permission-alignment` | every permission disclosed in PRIVACY.md (test the world) | blocking |
| `cer/permission-added-store-issue` | added permission → open store-dashboard issue (test the work) | advisory |
| `cer/readme-sections` | README has Install + Releasing | blocking |

`RELEASE.md` is the full contract (setup and the manual store steps); it is read on demand, not loaded every session. Most of its invariants are enforced by the checks above.
