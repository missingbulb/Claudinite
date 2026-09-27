// Technology stub pack: Android app development (Gradle/AGP, manifests, permissions, signing, flavors).
// No rules captured yet, so no RULES.md.
export default {
  version: '60925.1',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'gradle/AGP builds, AndroidManifest, permissions, signing configs, product flavors and emulator workflows for an Android app module',
    excludes: 'store submission and release cadence — play-store-release; Flutter-side widget or Dart code — flutter',
  },
  pitch: 'This pack starts empty. It is the place where an Android repo\'s own hard-won lessons accumulate as its Claude Code sessions run into them: Gradle and build quirks, manifest permissions, signing and release builds, emulator and device testing. Nothing ships in it yet, so adopting it today adds no rules or checks; what it adds is a home, so the next time a session learns something the painful way about Android, that lesson is captured and every later session starts out knowing it.',
  locate: { about: 'android/app/src/main/AndroidManifest.xml', paths: /android\/app\/src\/main\/AndroidManifest\.xml$/ },
};
