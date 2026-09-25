// Technology pack: building on Firebase (Auth, Firestore, Cloud Functions,
// FCM) — schema/rules discipline, function patterns, testing without live
// infrastructure, and deploy layout. Fingerprint: firebase.json at the repo
// root or one directory down, never deeper.

const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  version: '60925.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'building on Firebase: Firestore rules, callable Cloud Function patterns, FCM, emulator testing, deploy layout, dev/prod release split',
    excludes: 'app store submission and its store-side registration — play-store-release, app-store-release',
  },
  marker: 'firebase.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'firebase.json'),
  // The deploy-layout guards live beside this manifest: functions-predeploy-build
  // in worldRules/, functions-node-pin in declared-checks.json. Both are
  // relevance-first - see README.md.
};
