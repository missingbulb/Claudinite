// Technology pack: iOS app development (Xcode project, Info.plist usage strings, entitlements, signing).
export default {
  version: '60904.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'app-target conventions for iOS — Xcode project, Info.plist usage strings, entitlements, code signing',
    excludes: 'shipping builds to the App Store — that is app-store-release; Android equivalents are android',
  },
  marker: 'ios/Runner/Info.plist',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('ios/Runner/Info.plist')),
};
