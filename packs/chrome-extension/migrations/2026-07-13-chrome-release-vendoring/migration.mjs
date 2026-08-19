// chrome-extension-release's reusable workflows + composite actions moved out of
// Claudinite core (.github/) and into the pack, vendored into each consumer's own
// .github/ (#276). GitHub only resolves a reusable workflow / composite action
// from a repo's own .github/, never from a packs/… subdir, so "into the pack"
// means the pack holds the templates and each consumer hosts a managed copy.
//
// This record is the transition's whole machinery:
//   - appliesTo    — the gate: only a repo whose orchestrator is named
//                    "Release to Chrome Store" (the consumers). Claudinite carries
//                    a file of the same path named "… (reusable)", so it's skipped.
//   - materialize  — vendor the four reusable workflows + three composite actions
//                    verbatim into the consumer's .github/ (idempotent; overwrites
//                    on drift, so a hand-edited copy self-heals).
//   - rewrite      — repoint the orchestrator's three cross-repo @main calls at the
//                    local vendored files, preserving any per-repo build_env tweak.
//   - legacyPresent — telemetry: still on the old shape while anything under
//                    .github/workflows/ references Claudinite's core release
//                    workflows @main.
//
// The check-layer tolerance is driven by migrationActive('chrome-release-vendoring')
// (registry.mjs), which ends on its own once this record ages out of the recency
// window. The canon's now-unused core release plumbing (the four workflows + two
// composite actions this record vendored into the consumers — NOT report-failure,
// which is shared canon infrastructure that non-chrome workflows call @main
// directly) stays in the canon until someone sweeps it by hand, together with the
// inline references that name it — the barriers `except` entries in the canon's
// .claudinite-checks.json, the .github/workflows/README.md links, and this
// migration's own tests. (A past automated retirement deleted them on fleet
// telemetry alone and broke the canon's CI with 53 stale-ref findings.)
const STUB = '.github/workflows/chrome-extension-release.yml';
const S = 'packs/chrome-extension/stubs';

export default {
  id: 'chrome-release-vendoring',
  landed: '2026-07-13',
  version: 1,
  summary: 'chrome-extension-release reusable workflows + composite actions vendored from Claudinite core into each consumer repo (#276)',

  // Only touch a repo that ships the pipeline — its orchestrator is named
  // "Release to Chrome Store" (or the legacy "Release"). `read(path)` returns the
  // file's content or null.
  appliesTo: async (read) => {
    const text = await read(STUB);
    if (!text) return false;
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    return name === 'Release to Chrome Store' || name === 'Release';
  },

  // Vendor the reusable workflows + actions verbatim (the create-package reusable
  // is renamed from chrome-extension-release.yml to avoid colliding with the
  // orchestrator's own filename inside one repo).
  materialize: [
    { template: `${S}/workflows/chrome-extension-create-package.yml`, dest: '.github/workflows/chrome-extension-create-package.yml' },
    { template: `${S}/workflows/chrome-extension-publish-store.yml`, dest: '.github/workflows/chrome-extension-publish-store.yml' },
    { template: `${S}/workflows/chrome-extension-daily-release.yml`, dest: '.github/workflows/chrome-extension-daily-release.yml' },
    { template: `${S}/workflows/deploy-privacy-page.yml`, dest: '.github/workflows/deploy-privacy-page.yml' },
    { template: `${S}/actions/read-release-config/action.yml`, dest: '.github/actions/read-release-config/action.yml' },
    { template: `${S}/actions/read-release-config/read-config.mjs`, dest: '.github/actions/read-release-config/read-config.mjs' },
    { template: `${S}/actions/bump-extension-patch/action.yml`, dest: '.github/actions/bump-extension-patch/action.yml' },
    { template: `${S}/actions/bump-extension-patch/bump.mjs`, dest: '.github/actions/bump-extension-patch/bump.mjs' },
    { template: `${S}/actions/report-failure/action.yml`, dest: '.github/actions/report-failure/action.yml' },
  ],

  // Repoint the orchestrator's three @main calls at the local vendored files.
  rewrite: [
    { file: STUB, replace: [
      { from: 'missingbulb/Claudinite/.github/workflows/chrome-extension-release.yml@main', to: './.github/workflows/chrome-extension-create-package.yml' },
      { from: 'missingbulb/Claudinite/.github/workflows/chrome-extension-publish-store.yml@main', to: './.github/workflows/chrome-extension-publish-store.yml' },
      { from: 'missingbulb/Claudinite/.github/workflows/chrome-extension-daily-release.yml@main', to: './.github/workflows/chrome-extension-daily-release.yml' },
    ] },
  ],

  // A repo is still on the legacy shape while anything under .github/workflows/
  // still references Claudinite's core release workflows @main.
  legacyPresent: async (exists, read) => {
    const text = (await read(STUB)) || '';
    return text.includes('missingbulb/Claudinite/.github/workflows/chrome-extension-');
  },
};
