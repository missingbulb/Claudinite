// Prose-only pack with no reliable structural fingerprint — declaration is
// authoritative (detect: null skips the drift check in both directions).
export default {
  id: 'html',
  always: false,
  marker: null,
  detect: null,
  prose: 'RULES.md',
  rules: [],
};
