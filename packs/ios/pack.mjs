// Technology stub pack: iOS app development (Xcode project, Info.plist usage strings, entitlements, signing).
export default {
  id: 'ios',
  marker: 'ios/Runner/Info.plist',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('ios/Runner/Info.plist')),
  prose: 'RULES.md',
  rules: [],
};
