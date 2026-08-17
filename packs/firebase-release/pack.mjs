// The opt-in Firebase release standard: dev/prod project separation, config
// provenance, and store-attestation gating. Declared when a project is ready
// to ship (like chrome-extension-release) — no structural fingerprint yet;
// the declaration is authoritative until the first exercised release wires
// its workflow stubs.
export default {
  id: 'firebase-release',
  version: 2,
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'dev/prod Firebase project split, committed-default-dev discipline, pipeline-injected prod config, App Check attestation gating, promotion cadence',
    excludes: 'everyday Firestore rules, function patterns and deploy layout — firebase; app store submission — play-store-release, app-store-release',
  },
  badge: 'badge.svg',
  marker: null,
  detect: null,
  // The release standard builds on the Firebase coding/deploy pack.
  requires: ['firebase'],
  prose: 'RULES.md',
  worldRules: [],
};
