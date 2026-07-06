import { findExtensionManifest } from '../../checks/lib/manifest.mjs';
import releaseWorkflows from './release-workflows.mjs';
import templateTokens from './template-tokens.mjs';
import versionSync from './version-sync.mjs';
import releaseLayout from './release-layout.mjs';
import permissionJustifications from './permission-justifications.mjs';
import readmeSections from './readme-sections.mjs';

export default {
  id: 'chrome-extension',
  always: false,
  marker: 'a manifest.json declaring manifest_version',
  detect: (ctx) => findExtensionManifest(ctx) !== null,
  prose: 'RULES.md',
  rules: [
    releaseWorkflows,
    templateTokens,
    versionSync,
    releaseLayout,
    permissionJustifications,
    readmeSections,
  ],
};
