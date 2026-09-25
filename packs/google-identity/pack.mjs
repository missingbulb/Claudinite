// Prose-free pack for validating Google Sign-In (Google Identity) ID tokens on
// the server/backend: it carries no rules of its own, mounting the
// google-id-token-validation skill, whose check-the-work rules carry the
// teaching in their failure messages.
export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'server-side Google Sign-In ID token validation: audience pinning, issuer and email_verified checks, JWT authorizer/OIDC verifier config',
    excludes: 'obtaining the token in a browser or extension client — chrome-extension; Firebase Auth usage — firebase',
  },
  marker: 'a backend that validates Google Sign-In ID tokens (a JWT authorizer / OIDC verifier with the Google accounts issuer)',
};
