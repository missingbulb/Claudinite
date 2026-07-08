// Prose-only pack (no checks yet — the jsdom gotchas are knowledge, not
// signatures). Fingerprint: a package.json at the repo root OR one directory
// down (a monorepo's functions/ or server/ dir) — but never deeper, so a
// package.json in a nested fixture/example tree can't trip detection.
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'node',
  always: false,
  marker: 'package.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'package.json'),
  prose: 'RULES.md',
  rules: [],
};
