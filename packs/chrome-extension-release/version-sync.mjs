import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
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
