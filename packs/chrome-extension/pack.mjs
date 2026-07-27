import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';
import setIconImageData from './set-icon-image-data.mjs';

// The coding pack: MV3 build/runtime gotchas that apply whenever you are writing
// an extension, fingerprinted by the manifest. Release and Chrome-Web-Store
// publication are a separate, opt-in concern — the chrome-extension-release pack
// (its RELEASE.md and conformance checks), declared when the project is ready to
// ship. Most of this pack is prose, because most MV3 gotchas are runtime
// behavior with no signature in the artifact; the ones that DO leave a signature
// are carried as checks instead.
export default {
  id: 'chrome-extension',
  marker: 'a manifest.json declaring manifest_version',
  detect: (ctx) => findExtensionManifest(ctx) !== null,
  prose: 'RULES.md',
  rules: [setIconImageData],
};
