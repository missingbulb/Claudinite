# chrome-extension-release pack

The release & Chrome-Web-Store publication standard for our extensions — the reusable workflows' contract, the setup steps, the manual store actions (`RELEASE.md`), the **vendored release set** (`stubs/workflows/` + `stubs/actions/`, materialized into each consumer's own `.github/`), and the conformance checks. **Opt-in**: a project declares it in `.claudinite-checks.json` when it's ready to ship (a `manifest.json` alone does not pull it in). Declaring it is the cue to vendor the release machinery — the migration apply pass materializes the set (the `chrome-release-vendoring` migration), the pack's checks keep it in shape, and setup opens the one-time first-publication issue. GitHub only resolves a reusable workflow / composite action from a repo's own `.github/`, so the pack holds the templates and each consumer hosts a managed copy — no cross-repo `@main` dependency.

Fingerprint: a repo already carrying the standard's `Release to Chrome Store` orchestrator (a workflow with that name — or a legacy pre-rename name like `Release` — that wires the create-package reusable, whether via the vendored local `./.github/workflows/chrome-extension-create-package.yml` or the pre-vendoring canon call `@main`). `--init` uses it to seed the pack into a fresh declaration (including a repo that shipped release before this pack existed); the marker only *suspects* the pack, so it never forces or forbids the declaration afterward.

## Checks

The release set's conformance rules. Every one of them is about a release that would otherwise fail — or publish the wrong thing — only once it reached the store.

| Check | Reported as | Severity | Reason | Enforces |
|---|---|---|---|---|
| `cer/release-workflows` | blocking | high | correctness | the vendored orchestrator, reusable workflows and composite actions are present and wired to the local copies |
| `cer/template-tokens` | blocking | high | correctness | no `__TOKEN__` placeholder survives setup |
| `cer/release-config` | blocking | high | correctness | the release config is explicit with no defaults — a missing or typo'd key would ship the wrong thing with no signal |
| `cer/version-sync` | blocking | high | correctness | every declared version agrees; a divergent one ships the wrong number to the store or refuses to publish |
| `cer/release-layout` | blocking | medium | correctness | the privacy page deploys from `PRIVACY.md`, which the store listing points at as a live URL |
| `cer/readme-sections` | blocking | low | complexity | install and release are documented the same way in every extension repo |
| `cer/privacy-permission-alignment` | blocking | critical | legal | the deployed privacy policy discloses everything the extension can access — an undisclosed permission is a store-review and trust failure |
| `cer/permission-added-store-issue` | advisory | high | legal | adding a permission opens the store-listing issue that its disclosure and review ride |
