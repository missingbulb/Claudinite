// Prose-only pack (no checks yet — the jsdom gotchas are knowledge, not signatures).
export default {
  id: 'node',
  always: false,
  marker: 'package.json at the repo root',
  detect: (ctx) => ctx.tracked.includes('package.json'),
  prose: 'RULES.md',
  rules: [],
};
