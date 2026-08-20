// Opt-in release stub pack: releasing to the Apple App Store (App Store Connect, provisioning, review, TestFlight). Declared when a project first ships
// there — no fingerprint until the first exercised release wires one.
// Stub — no rules captured yet; add durable, project-agnostic practices to RULES.md
// as they are earned. Expected first source: missingbulb/ShoutsAndWhispers.
export default {
  id: 'app-store-release',
  version: '60820.1',
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'shipping to the Apple App Store: App Store Connect, provisioning, App Attest, TestFlight, review guidelines, release cadence',
    excludes: 'iOS coding, Info.plist and Xcode project practices — that is ios; backend environment split — firebase',
  },
  badge: 'badge.svg',
  marker: null,
  detect: null,
  prose: 'RULES.md',
  worldRules: [],
};
