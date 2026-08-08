import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { sourceFiles, callWindows } from '../../scan.mjs';

// Substitution attacks: a signature only proves who SIGNED a token, never who
// it was FOR — a valid token minted for another service (or another context in
// the same service) passes a verifier that checks nothing but the signature.
// Binding the expected audience (and issuer) at the verify call is what scopes
// a token to this consumer.
//
// Advisory on purpose: a single-party token (signer == only verifier, e.g. a
// client-side session blob) legitimately skips aud/iss, so this is a smell to
// judge, not a defect to fix. RELEVANCE FIRST: JS/TS source importing
// 'jsonwebtoken' or 'jose', then only verify call sites; the word appearing
// anywhere in the file (an options object built elsewhere) passes it.
const LIB = /['"](jsonwebtoken|jose)['"]/;
const JS = /\.(mjs|cjs|js|jsx|ts|tsx)$/;
const VERIFY_CALL = /\.verify\s*\(|\bjwtVerify\s*\(/;
const BOUND = /\b(audience|issuer)\b/;

const rule = {
  id: 'jwt-verify-binds-audience',
  severity: 'advisory',
  description: 'A JWT verify call binds the expected audience or issuer',
  doc: 'skills/jwt-validation/SKILL.md',
  why: 'the signature proves who signed the token, not who it was for — without an audience/issuer check, a valid token minted for a different service or purpose is accepted here (substitution attack)',

  run(ctx) {
    const out = [];
    for (const f of sourceFiles(ctx).filter((x) => JS.test(x))) {
      const text = ctx.read(f) ?? '';
      if (!LIB.test(text) || BOUND.test(text)) continue;
      for (const { line } of callWindows(text, VERIFY_CALL)) {
        out.push(finding(rule, {
          file: f, line,
          what: 'verifies a JWT binding neither audience nor issuer (neither word appears in this file)',
          fix: 'pass the expected audience (and issuer) to the verify call so a token minted for another recipient is rejected — validate every claim the token carries',
        }));
      }
    }
    return out;
  },
};

export default rule;
