// Opt-in release stub pack: releasing to the Apple App Store (App Store Connect, provisioning, review, TestFlight).
// No rules captured yet, so no RULES.md; no fingerprint, so a project declares it by hand.
export default {
  version: '60921.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'shipping to the Apple App Store: App Store Connect, provisioning, App Attest, TestFlight, review guidelines, release cadence',
    excludes: 'iOS coding, Info.plist and Xcode project practices — that is ios; backend environment split — firebase',
  },
};
