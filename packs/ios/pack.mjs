// Technology stub pack: iOS app development (Xcode project, Info.plist usage strings, entitlements, signing).
export default {
  id: 'ios',
  ruleRoutingGuidance: {
    belongs: 'app-target conventions for iOS — Xcode project, Info.plist usage strings, entitlements, code signing',
    excludes: 'shipping builds to the App Store — that is app-store-release; Android equivalents are android',
  },
  badge: 'badge.svg',
  marker: 'ios/Runner/Info.plist',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('ios/Runner/Info.plist')),
  prose: 'RULES.md',
  worldRules: [],
};
