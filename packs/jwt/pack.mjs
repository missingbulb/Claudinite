// The JSON Web Token pack: minting and validating JWTs safely. It contributes
// no prose; two action skills (jwt-minting, jwt-validation) carry the judgment
// half, and five declared checks under them carry the static half.
//
// Fingerprinted by a JWT library reference in JS/TS/Python source. The marker
// only *suspects* the pack; declaring it is the project's call, like every pack.

export default {
  version: '60925.1',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'minting and validating JSON Web Tokens: algorithm pinning, claim validation, key strength and secrecy, expiry, JWE',
    excludes: 'the Google-issuer validator config — google-identity; OAuth client-side token acquisition — chrome-extension',
  },
  pitch: 'Token handling is where small mistakes become security holes: accepting the none algorithm, leaving algorithms unpinned, hardcoding a signing secret, issuing tokens that never expire. This pack guards a repo that mints or validates JSON Web Tokens with a handful of checks that run on every change, blocking the critical mistakes and flagging missing audience binding or expiry. Two skills guide Claude Code sessions through minting tokens, from algorithm and key choice to claims, and wiring verification correctly. It adds no always-on prose.',
  locate: {
    about: 'a JWT library (jsonwebtoken / jose / PyJWT) referenced in JS/TS/Python source',
    paths: /\.(mjs|cjs|js|jsx|ts|tsx|py)$/,
    text: /['"](jsonwebtoken|express-jwt|jwks-rsa|node-jose|jose|python-jose)['"]|^\s*(import\s+jwt\b|from\s+jwt(\.[\w.]*)?\s+import\b)/m,
    search: ['jsonwebtoken', 'jose', 'jwt', 'jwks'],
  },
};
