import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WORKFLOW_FILE } from '../../engine/checks/helpers/github-workflows.mjs';

// This pack's declared checks — pattern specs, not code. The spec vocabulary is
// documented in the helper's header; each declaration below reads as its own
// contract (what it scans, what it requires, what the failure says).

export const templateTokens = patternRule({
  id: 'cer/template-tokens',
  severity: 'blocking',
  description: 'No __TOKEN__ placeholder may survive in the release workflows',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the setup contract says: grep for __ afterwards; no token may survive',
  scanFiles: WORKFLOW_FILE,
  scanTracked: true,
  matchLines: [{
    match: /__[A-Z_]+__/,
    what: 'unreplaced template token {match}',
    fix: 'replace it with this repo\'s value (zip name, bump command, …) per the setup steps',
  }],
});

export const releaseConfig = patternRule({
  id: 'cer/release-config',
  severity: 'blocking',
  description: '.github/release.config exists and sets exactly the required release keys',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the release config is explicit with no defaults — a missing/typo\'d key would ship the wrong thing with no signal',
  checkKeyValueFile: [{
    file: '.github/release.config',
    keys: ['manifest_path', 'package_json_path', 'setup_command', 'test_command', 'ship_paths'],
    whenMissing: {
      what: 'missing — the release config is required and fully explicit (no defaults)',
      fix: 'create it with the required keys: {keys}',
    },
    whenLineNotKeyValue: {
      what: 'line is not KEY=value or a # comment: "{line}"',
      fix: 'use dotenv syntax — KEY=value, one per line',
    },
    whenKeyUnknown: {
      what: 'unknown key "{key}"',
      fix: 'valid keys: {keys}',
    },
    whenKeyMissing: {
      what: 'missing required key "{key}"',
      fix: 'add "{key}=..." (every key is explicit; "setup_command=" may be empty to mean no install)',
    },
  }],
});

export const versionSync = patternRule({
  id: 'cer/version-sync',
  severity: 'blocking',
  description: "The manifest's version is the single source of truth; package.json must equal it",
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'a version that diverges ships the wrong number to the store or refuses to publish',
  equalParsedValues: [{
    first: { filesMatching: /manifest\.json$/, whereFileContains: /"manifest_version"/, field: 'version' },
    second: { file: 'package.json', field: 'version' },
    whenSecondMissing: {
      what: 'missing — the release pipeline builds via npm run build at the repo root',
      fix: 'add the root package.json with version equal to the manifest\'s',
    },
    whenUnequal: {
      what: 'manifest version {first} != package.json version {second}',
      fix: 'bump both together — "bump version" edits the manifest and package.json in the same change',
    },
  }],
});

export const releaseLayout = patternRule({
  id: 'cer/release-layout',
  severity: 'blocking',
  description: 'The privacy policy source lives at the standard store_artifacts path',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the privacy page deploys from PRIVACY.md, and the store listing points at that live URL',
  requirePaths: [{
    path: 'dev/build/release/store_artifacts/PRIVACY.md',
    what: 'required release artifact {path} is missing',
    fix: 'create it per the layout in the release standard (adapt from the reference repo)',
  }],
});

export const readmeSections = patternRule({
  id: 'cer/readme-sections',
  severity: 'blocking',
  description: 'The README carries the standard Install and Releasing sections',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'every extension repo documents install and release the same way, from the standard template',
  scanFiles: 'README.md',
  whenMissing: {
    what: 'missing',
    fix: 'add a README with the standard Install and Releasing sections',
  },
  checkEachFile: [
    {
      require: /^##\s+Install\b/m,
      what: 'missing the standard "## Install" section',
      fix: 'copy it from the README template in the release standard and fill in the repo values',
    },
    {
      require: /^##\s+Releasing\b/m,
      what: 'missing the standard "## Releasing" section',
      fix: 'copy it from the README template in the release standard and fill in the repo values',
    },
  ],
});

export default [templateTokens, releaseConfig, versionSync, releaseLayout, readmeSections];
