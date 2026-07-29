// Opt-in release stub pack: releasing to the Google Play Store (Play Console, signing, integrity, staged rollout). Declared when a project first ships
// there — no fingerprint until the first exercised release wires one.
export default {
  id: 'play-store-release',
  ruleRoutingGuidance: {
    belongs: 'shipping an Android app to Google Play — Play Console, signing, integrity, staged rollout',
    excludes: 'day-to-day Android or iOS coding rules — those are android and ios; Apple shipping is app-store-release',
  },
  badge: 'badge.svg',
  marker: null,
  detect: null,
  prose: 'RULES.md',
  worldRules: [],
};
