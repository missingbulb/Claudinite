// Technology stub pack: iOS app development (Xcode project, Info.plist usage strings, entitlements, signing).
export default {
  id: 'ios',
  badge: {
    file: 'badge.svg',
    color: '#6b7280',
    glyph: 'M13 7.5h6a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5h-6a2.5 2.5 0 0 1-2.5-2.5V10A2.5 2.5 0 0 1 13 7.5z M14 21.8h4',
  },
  marker: 'ios/Runner/Info.plist',
  detect: (ctx) => ctx.tracked.some((f) => f.endsWith('ios/Runner/Info.plist')),
  prose: 'RULES.md',
  rules: [],
};
