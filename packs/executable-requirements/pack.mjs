import featureRequirementsFirst from './feature-requirements-first.mjs';

// The executable-requirements framework standard: the concrete, portable
// conventions — layout, naming, gates, kinds, gallery, determinism — shared by
// every project that runs its spec as tests. The judgment layer (owner-owned
// expecteds, doc-first discipline) is the spec-driven-product pack; this pack
// is the mechanics that implement it. Fingerprinted by the framework's one
// structural constant: the spec file itself.
export default {
  id: 'executable-requirements',
  badge: {
    file: 'badge.svg',
    color: '#5b21b6',
    glyph: 'M19 7.5h-6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V10.5z M19 7.5v3h2.5 M14.5 15.5l4.5 2.6-4.5 2.6z',
  },
  marker: 'dev/requirements/requirements.md',
  detect: (ctx) => ctx.tracked.includes('dev/requirements/requirements.md'),
  prose: 'RULES.md',
  rules: [featureRequirementsFirst],
};
