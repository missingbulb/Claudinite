import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { matchingLines } from '../../../../engine/checks/helpers/line-scanning.mjs';
import { sourceFiles } from '../../scan.mjs';

// The alg:none bypass: strip a token's signature, set the header's alg to
// "none", and a verifier that honors it accepts attacker-written claims as
// valid. The one static signature of honoring it is "none" sitting in an
// algorithms allowlist — jsonwebtoken's `algorithms: [...]`, PyJWT's
// `algorithms=[...]`. Repo-state on purpose: a pre-existing allowlist with
// "none" is a live bypass and must keep firing until fixed.
//
// RELEVANCE FIRST (engine/checks/README.md "Adding a rule"): only non-test
// JS/TS/Python source that references a JWT surface at all, then only lines
// carrying the allowlist-with-none shape. Test paths and this pack's own tree
// are excluded by the shared file-set policy (scan.mjs).
const JWT_HINT = /jwt|jose/i;
const NONE_IN_LIST = /\balgorithms?\s*[:=]\s*\[[^\]]*['"]none['"]/i;

const rule = {
  id: 'jwt-none-not-accepted',
  severity: 'blocking',
  description: 'No JWT verification algorithm allowlist accepts "none"',
  doc: 'skills/jwt-validation/SKILL.md',
  why: 'a token whose header claims alg "none" carries no signature at all, so a verifier that accepts it treats attacker-written claims as authenticated — the classic signature-stripping bypass',

  run(ctx) {
    const files = sourceFiles(ctx).filter((f) => JWT_HINT.test(ctx.read(f) ?? ''));
    return matchingLines(ctx, files, NONE_IN_LIST).map(({ file, line }) => finding(rule, {
      file, line,
      what: 'lists "none" in a JWT verification-algorithm allowlist',
      fix: 'remove "none" — an unsigned token must never verify; list only the exact algorithm(s) this verifier expects',
    }));
  },
};

export default rule;
