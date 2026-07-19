// Prose-only pack for validating Google Sign-In (Google Identity) ID tokens on
// the server/backend. No reliable structural fingerprint — the technology shows
// up as an OIDC issuer (`https://accounts.google.com`) inside a JWT-authorizer or
// verifier config, which has no canonical filename and co-occurs with other
// stacks (SAM, a plain Node server) — so declaration is authoritative
// (detect: null skips the drift check in both directions), like the `html` pack.
//
// Scope note: obtaining the ID token in a browser/extension client
// (chrome.identity.launchWebAuthFlow, prompt=none, login_hint, token-at-rest)
// is the chrome-extension pack's turf; this pack owns the *validator* side —
// what a backend must get right when it trusts a Google ID token.
export default {
  id: 'google-identity',
  marker: 'a backend that validates Google Sign-In ID tokens (a JWT authorizer / OIDC verifier whose issuer is https://accounts.google.com)',
  detect: null,
  prose: 'RULES.md',
  rules: [],
};
