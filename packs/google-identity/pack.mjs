// Prose-free pack for validating Google Sign-In (Google Identity) ID tokens on
// the server/backend. No reliable structural fingerprint — the technology shows
// up as the Google accounts OIDC issuer inside a JWT-authorizer or verifier
// config, which has no canonical filename and co-occurs with other stacks (SAM,
// a plain Node server) — so declaration is authoritative (detect: null skips
// the drift check in both directions), like the `html` pack.
//
// The pack carries no rules of its own: it mounts the
// google-id-token-validation skill, whose check-the-work rules (run everywhere,
// self-gated on the validator artifact) carry the teaching in their failure
// messages. Obtaining the ID token in a browser/extension client is the
// chrome-extension pack's turf; this pack owns the *validator* side.
export default {
  id: 'google-identity',
  marker: 'a backend that validates Google Sign-In ID tokens (a JWT authorizer / OIDC verifier with the Google accounts issuer)',
  detect: null,
  skills: ['google-id-token-validation'],
  rules: [],
};
