// Prose-only stub pack.
export default {
  id: 'flutter',
  always: false,
  marker: 'pubspec.yaml',
  detect: (ctx) => ctx.tracked.includes('pubspec.yaml'),
  prose: 'RULES.md',
  rules: [],
};
