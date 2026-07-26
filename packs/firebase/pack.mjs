// Technology pack: building on Firebase (Auth, Firestore, Cloud Functions,
// FCM) — schema/rules discipline, function patterns, testing without live
// infrastructure, and deploy layout. Fingerprint: firebase.json — the config
// every Firebase repo carries — at the repo root OR one directory down (a
// monorepo's firebase/ project root), but never deeper, so a firebase.json in
// a nested fixture/example tree can't trip detection. A Firebase project root
// is the directory that holds firebase.json, not necessarily the repo root.
import functionsNodePin from './functions-node-pin.mjs';
import functionsPredeployBuild from './functions-predeploy-build.mjs';

const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'firebase',
  marker: 'firebase.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'firebase.json'),
  prose: 'RULES.md',
  // The deploy-layout guards (RULES.md §4). Both are relevance-first: inert
  // until the repo carries a firebase.json declaring a functions codebase whose
  // package.json is in this checkout — so a rules-only or hosting-only Firebase
  // repo never hears from them.
  rules: [functionsNodePin, functionsPredeployBuild],
};
