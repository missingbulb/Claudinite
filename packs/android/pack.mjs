// Technology stub pack: Android app development (Gradle/AGP, manifests, permissions, signing, flavors).
export default {
  id: 'android',
  badge: {
    file: 'badge.svg',
    color: '#22a366',
    glyph: 'M13 10.5h6a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-6a2.5 2.5 0 0 1-2.5-2.5V13a2.5 2.5 0 0 1 2.5-2.5z M12.4 7l1.9 2.7 M19.6 7l-1.9 2.7',
  },
  marker: 'android/app/src/main/AndroidManifest.xml',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('android/app/src/main/AndroidManifest.xml')),
  prose: 'RULES.md',
  rules: [],
};
