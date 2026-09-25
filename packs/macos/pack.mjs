
// Technology pack: a native macOS app — the app bundle, TCC and Hardened
// Runtime, the Developer ID / notarization / DMG distribution lane, and the
// process-lifecycle rules a Mac agent app has to get right.
//
// Fingerprint: a `Package.swift` at the repo root or one directory down (a
// monorepo's `mac/` dir), never deeper.
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'native macOS apps: app-bundle assembly, TCC usage strings, Hardened Runtime entitlements, Developer ID signing, notarization and DMG distribution',
    excludes: 'Mac App Store submission — app-store-release; iPhone app targets — ios; workflow YAML mechanics — git-github',
  },
  marker: 'Package.swift (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'Package.swift'),
};
