// Prose-only pack. Fingerprint: a pubspec.yaml at the repo root OR one
// directory down (a monorepo's app/ or client/ dir) — but never deeper, so a
// stray pubspec.yaml in a nested example/fixture tree can't trip detection.
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'flutter',
  always: false,
  marker: 'pubspec.yaml (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'pubspec.yaml'),
  prose: 'RULES.md',
  rules: [],
};
