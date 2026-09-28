export default {
  version: '60927.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'shipping to the Apple App Store: App Store Connect, provisioning, App Attest, TestFlight, review guidelines, release cadence',
    excludes: 'iOS coding, Info.plist and Xcode project practices — that is ios; backend environment split — firebase',
  },
  pitch: 'Shipping an iOS app through the App Store involves App Store Connect, provisioning profiles, TestFlight builds and review guidelines, and each release tends to relearn the same lessons. This pack starts empty: it holds no rules, checks or skills yet. It is where the repo\'s own hard-won lessons about Apple releases accumulate, captured as rules that every later Claude Code session reads before touching signing, submission or release cadence, so a rejection or a provisioning mistake happens once rather than every cycle.',
};
