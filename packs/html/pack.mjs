// Prose-only pack with no reliable structural fingerprint — declaration is
// authoritative (detect: null skips the drift check in both directions).
export default {
  version: '60822.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'hand-authored HTML markup gotchas — element nesting, injected content placement, live browser verification of a page',
    excludes: 'javascript runtime APIs — web-speech; map widgets — leaflet; npm and dependency policy — node',
  },
};
