// Technology pack: building on Firebase (Auth, Firestore, Cloud Functions,
// FCM) — schema/rules discipline, function patterns, testing without live
// infrastructure, and deploy layout. Fingerprint: firebase.json — the config
// every Firebase repo carries — at the repo root OR one directory down (a
// monorepo's firebase/ project root), but never deeper, so a firebase.json in
// a nested fixture/example tree can't trip detection. A Firebase project root
// is the directory that holds firebase.json, not necessarily the repo root.
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
  rules: [],
};
