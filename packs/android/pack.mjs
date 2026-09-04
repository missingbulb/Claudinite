// Technology stub pack: Android app development (Gradle/AGP, manifests, permissions, signing, flavors).
// Stub — no rules captured yet, so no RULES.md; durable, project-agnostic practices
// earn one as they are captured. Expected first source: missingbulb/ShoutsAndWhispers.
export default {
  version: '60903.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'gradle/AGP builds, AndroidManifest, permissions, signing configs, product flavors and emulator workflows for an Android app module',
    excludes: 'store submission and release cadence — play-store-release; Flutter-side widget or Dart code — flutter',
  },
  marker: 'android/app/src/main/AndroidManifest.xml',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('android/app/src/main/AndroidManifest.xml')),
};
