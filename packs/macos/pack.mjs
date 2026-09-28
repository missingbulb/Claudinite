
// Technology pack: a native macOS app — the app bundle, TCC and Hardened
// Runtime, the Developer ID / notarization / DMG distribution lane, and the
// process-lifecycle rules a Mac agent app has to get right.
//
// Fingerprint: a `Package.swift` at the repo root or one directory down (a
// monorepo's `mac/` dir), never deeper.
export default {
  version: '60927.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'native macOS apps: app-bundle assembly, TCC usage strings, Hardened Runtime entitlements, Developer ID signing, notarization and DMG distribution',
    excludes: 'Mac App Store submission — app-store-release; iPhone app targets — ios; workflow YAML mechanics — git-github',
  },
  pitch: 'Shipping a native Mac app means getting the bundle, signing, Hardened Runtime and notarization right, and each mistake surfaces late. This pack gives Claude Code sessions about two dozen rules covering app bundle assembly from SwiftPM, the Developer ID to notarization to DMG lane, CI signing identities, and privacy traps such as speech recognition streaming to Apple by default. Skills cover assembling the app bundle and deciding which gate a protected resource sits behind, and a handful of checks enforce steps such as notarizing then stapling.',
  relevanceDetector: { about: 'Package.swift (at the repo root or one directory down)', paths: "^([^/]+/)?Package\\.swift$" },
};
