// The opt-in Firebase release standard: dev/prod project separation, config
// provenance, and store-attestation gating. Declared when a project is ready
// to ship (like chrome-extension-release) — no structural fingerprint yet;
// the declaration is authoritative until the first exercised release wires
// its workflow stubs.
export default {
  id: 'firebase-release',
  marker: null,
  detect: null,
  prose: 'RULES.md',
  rules: [],
};
