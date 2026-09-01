// The JSON Web Token pack: minting and validating JWTs safely, distilled from
// The JWT Handbook (Sebastián E. Peyrott, Auth0). Prose-free — the teaching
// rides two action skills (jwt-minting, jwt-validation) whose check-the-world
// rules carry the rules in their failure messages: the alg:none bypass, the
// unpinned-algorithm confusion attacks, substitution via unbound audience,
// hardcoded/weak HMAC secrets, and never-expiring tokens. What a static sweep
// cannot judge (key-type/API discipline, nested-JWT validation order, JWE vs
// JWS guarantees) lives in the skills, read at usage time only.
//
// Fingerprinted by a JWT library reference in JS/TS/Python source. The marker
// only *suspects* the pack; declaring it is the project's call, like every pack.
// JWT practice moves with the outside world — an advisory or a revised best
// current practice can date this pack's guidance while nothing here is edited —
// so the README declares the sources that carry it, and the canon's own
// upstream-watch reconciles the content against them.
const JWT_LIB = /['"](jsonwebtoken|express-jwt|jwks-rsa|node-jose|jose|python-jose)['"]|^\s*(import\s+jwt\b|from\s+jwt(\.[\w.]*)?\s+import\b)/m;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx|py)$/;

export default {
  version: '60901.1',
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
