// Technology stub pack: Android app development (Gradle/AGP, manifests, permissions, signing, flavors).
// Stub — no rules captured yet; add durable, project-agnostic practices to RULES.md
// as they are earned. Expected first source: missingbulb/ShoutsAndWhispers.
export default {
  id: 'android',
  version: 2,
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'gradle/AGP builds, AndroidManifest, permissions, signing configs, product flavors and emulator workflows for an Android app module',
    excludes: 'store submission and release cadence — play-store-release; Flutter-side widget or Dart code — flutter',
  },
  badge: 'badge.svg',
  marker: 'android/app/src/main/AndroidManifest.xml',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('android/app/src/main/AndroidManifest.xml')),
  prose: 'RULES.md',
  worldRules: [],
};
