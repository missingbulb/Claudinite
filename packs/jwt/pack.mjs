// The JSON Web Token pack: minting and validating JWTs safely. It contributes
// no prose; two action skills (jwt-minting, jwt-validation) carry the judgment
// half, and five declared checks under them carry the static half.
//
// Fingerprinted by a JWT library reference in JS/TS/Python source. The marker
// only *suspects* the pack; declaring it is the project's call, like every pack.
const JWT_LIB = /['"](jsonwebtoken|express-jwt|jwks-rsa|node-jose|jose|python-jose)['"]|^\s*(import\s+jwt\b|from\s+jwt(\.[\w.]*)?\s+import\b)/m;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx|py)$/;

export default {
  version: '60920.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'minting and validating JSON Web Tokens: algorithm pinning, claim validation, key strength and secrecy, expiry, JWE',
    excludes: 'the Google-issuer validator config — google-identity; OAuth client-side token acquisition — chrome-extension',
  },
  marker: 'a JWT library (jsonwebtoken / jose / PyJWT) referenced in JS/TS/Python source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && JWT_LIB.test(text);
    }),
};
