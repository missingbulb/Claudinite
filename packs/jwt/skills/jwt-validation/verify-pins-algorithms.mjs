import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { sourceFiles, callWindows } from '../../scan.mjs';

// With no algorithms allowlist, jsonwebtoken historically selected the
// verification algorithm from the token's own header — the attacker-controlled
// field — enabling both the alg:none bypass and the RS256-public-key-as-HS256-
// secret forgery. Explicit pinning closes the whole class, whatever the library
// version's defaults.
//
// RELEVANCE FIRST: only JS/TS source that imports 'jsonwebtoken' (the one
// library with this exact call shape; jose binds algorithms to key types),
// then only `.verify(` call sites. A call whose window lacks `algorithms` gets
// the benefit of the doubt when the WORD appears anywhere else in the file
// (an options object built above the call) — the same file-level fallback the
// google-token-audience rule uses to stay false-positive-free.
const JSONWEBTOKEN = /['"]jsonwebtoken['"]/;
const JS = /\.(mjs|cjs|js|jsx|ts|tsx)$/;
const VERIFY_CALL = /\.verify\s*\(/;
const ALGORITHMS = /\balgorithms\b/;

const rule = {
  id: 'jwt-verify-pins-algorithms',
  severity: 'blocking',
  description: 'Every jsonwebtoken verify call pins an explicit algorithms allowlist',
  doc: 'skills/jwt-validation/SKILL.md',
  why: 'without an allowlist the verification algorithm can come from the token\'s own header — the attacker writes that header, so they pick the algorithm ("none", or HS256 keyed with your published public key)',

  run(ctx) {
    const out = [];
    for (const f of sourceFiles(ctx).filter((x) => JS.test(x))) {
      const text = ctx.read(f) ?? '';
      if (!JSONWEBTOKEN.test(text) || ALGORITHMS.test(text)) continue;
      for (const { line } of callWindows(text, VERIFY_CALL)) {
        out.push(finding(rule, {
          file: f, line,
          what: 'verifies a JWT with no algorithms allowlist (and none is set anywhere in this file)',
          fix: 'pass { algorithms: [\'<the one algorithm this issuer uses>\'] } to every jsonwebtoken verify call — never let the token pick',
        }));
      }
    }
    return out;
  },
};

export default rule;
