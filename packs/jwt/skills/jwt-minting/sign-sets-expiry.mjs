import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { sourceFiles, callWindows } from '../../scan.mjs';

// A token minted with no exp is valid forever: stateless validation has no
// revocation, so a leaked non-expiring token is a permanent credential. The
// static signature is a sign/encode call with no expiry in sight.
//
// Advisory on purpose: some tokens legitimately never expire (a device pairing
// blob), and the payload may be assembled in another file — so this is a smell
// to judge. RELEVANCE FIRST: JS/TS importing 'jsonwebtoken' (`.sign(` sites,
// expiry = the expiresIn option or an exp claim) and Python importing jwt
// (`jwt.encode(` sites, expiry = an exp claim); the word appearing anywhere in
// the file passes it, the same benefit-of-the-doubt fallback the pinning rule
// uses.
const JS = /\.(mjs|cjs|js|jsx|ts|tsx)$/;
const PY = /\.py$/;
const JSONWEBTOKEN = /['"]jsonwebtoken['"]/;
const PY_IMPORT = /^\s*(import\s+jwt\b|from\s+jwt(\.[\w.]*)?\s+import\b)/m;
const EXPIRY = /\bexpiresIn\b|\bexp\b/;

const rule = {
  id: 'jwt-sign-sets-expiry',
  severity: 'advisory',
  description: 'A minted JWT carries an expiry (expiresIn option or exp claim)',
  doc: 'skills/jwt-minting/SKILL.md',
  why: 'a token with no exp never stops being valid, and stateless validation has no revocation — a leak becomes a permanent credential',

  run(ctx) {
    const out = [];
    const sites = [
      { files: sourceFiles(ctx).filter((f) => JS.test(f)), lib: JSONWEBTOKEN, call: /\.sign\s*\(/ },
      { files: sourceFiles(ctx).filter((f) => PY.test(f)), lib: PY_IMPORT, call: /\bjwt\.encode\s*\(/ },
    ];
    for (const { files, lib, call } of sites) {
      for (const f of files) {
        const text = ctx.read(f) ?? '';
        if (!lib.test(text) || EXPIRY.test(text)) continue;
        for (const { line } of callWindows(text, call)) {
          out.push(finding(rule, {
            file: f, line,
            what: 'signs a JWT with no expiry in sight (no expiresIn option or exp claim in this file)',
            fix: 'set expiresIn (or an exp claim) when signing, as short as the flow allows — pair long-lived access with a refresh token, not a long expiry',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
