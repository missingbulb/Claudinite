// Prose-only pack with no reliable structural fingerprint — declaration is
// authoritative (detect: null skips the drift check in both directions).
export default {
  id: 'html',
  ruleRoutingGuidance: {
    belongs: 'hand-authored HTML markup gotchas — element nesting, injected content placement, live browser verification of a page',
    excludes: 'javascript runtime APIs — web-speech; map widgets — leaflet; npm and dependency policy — node',
  },
  badge: 'badge.svg',
  marker: null,
  detect: null,
  prose: 'RULES.md',
  worldRules: [],
};
