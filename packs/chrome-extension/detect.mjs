import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';

// One of the four fingerprints that stays code. Recognizing an extension means
// LOCATING its manifest.json — which can sit at any depth, under any name a build
// produces — and reading it to confirm it declares `manifest_version`. That is a
// question about a file's content, which the declarative `trackedPath` vocabulary
// deliberately cannot ask (engine/pack_loader/detect-spec.mjs: a predicate
// language in JSON is worse than the few packs that keep a function).
export default (ctx) => findExtensionManifest(ctx) !== null;
