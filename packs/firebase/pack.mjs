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
  badge: {
    file: 'badge.svg',
    color: '#f59e0b',
    glyph: 'M16 25.5c3.4 0 6.2-2.4 6.2-5.6 0-4.6-6.2-11.9-6.2-11.9 0 0-6.2 7.3-6.2 11.9 0 3.2 2.8 5.6 6.2 5.6z M16 25.5c1.6 0 2.9-1.2 2.9-2.7 0-2.2-2.9-5.3-2.9-5.3 0 0-2.9 3.1-2.9 5.3 0 1.5 1.3 2.7 2.9 2.7z',
  },
  marker: 'firebase.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'firebase.json'),
  prose: 'RULES.md',
  // The deploy-layout guards (RULES.md §4). Both are relevance-first: inert
  // until the repo carries a firebase.json declaring a functions codebase whose
  // package.json is in this checkout — so a rules-only or hosting-only Firebase
  // repo never hears from them.
  rules: [functionsNodePin, functionsPredeployBuild],
};
