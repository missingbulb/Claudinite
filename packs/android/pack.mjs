// Technology stub pack: Android app development (Gradle/AGP, manifests, permissions, signing, flavors).
export default {
  id: 'android',
  always: false,
  marker: 'android/app/src/main/AndroidManifest.xml',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('android/app/src/main/AndroidManifest.xml')),
  prose: 'RULES.md',
  rules: [],
};
