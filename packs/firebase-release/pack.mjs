// The opt-in Firebase release standard: dev/prod project separation, config
// provenance, and store-attestation gating. Declared when a project is ready
// to ship (like chrome-extension-release) — no structural fingerprint yet;
// the declaration is authoritative until the first exercised release wires
// its workflow stubs.
export default {
  id: 'firebase-release',
  badge: {
    file: 'badge.svg',
    color: '#c2410c',
    glyph: 'M9 24.5h14 M16 20.5V8.5 M11.5 13l4.5-4.5 4.5 4.5',
  },
  marker: null,
  detect: null,
  // The release standard builds on the Firebase coding/deploy pack.
  requires: ['firebase'],
  prose: 'RULES.md',
  rules: [],
};
