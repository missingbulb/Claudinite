import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { matchingLines } from '../../../../engine/checks/helpers/line-scanning.mjs';
import { sourceFiles } from '../../scan.mjs';

// A signing secret written as a string literal ships with every clone and
// lives in git history forever — and for HMAC algorithms, whoever reads it can
// MINT tokens, not just verify them. Repo-state on purpose: a committed secret
// stays compromised until rotated out, however long ago it merged.
//
// RELEVANCE FIRST: JS/TS files importing 'jsonwebtoken' (sign/verify's second
// argument is the key) and Python files importing jwt (encode/decode's second
// argument), then only lines passing a plain string literal in that position.
// A template literal with an interpolation (`${…}`) is config plumbing, not a
// hardcoded secret, and is skipped. Tests are excluded by the shared file-set
// policy — a fixture secret exercises the hazard rather than shipping it.
const JS = /\.(mjs|cjs|js|jsx|ts|tsx)$/;
const PY = /\.py$/;
const JSONWEBTOKEN = /['"]jsonwebtoken['"]/;
const PY_IMPORT = /^\s*(import\s+jwt\b|from\s+jwt(\.[\w.]*)?\s+import\b)/m;
const JS_LITERAL_KEY = /\.(sign|verify)\s*\(\s*[^,()]+,\s*(['"`])(?!\s*\2)[^'"`]+\2/;
const PY_LITERAL_KEY = /\bjwt\.(encode|decode)\s*\(\s*[^,()]+,\s*(['"])[^'"]+\2/;
const INTERPOLATED = /\$\{/;

const rule = {
  id: 'jwt-hardcoded-secret',
  severity: 'blocking',
  description: 'No JWT sign/verify call takes a literal string as its secret or key',
  doc: 'skills/jwt-minting/SKILL.md',
  why: 'a secret in source ships with every clone and survives in git history forever, and an HMAC secret grants full token-MINTING power to anyone who reads it',

  run(ctx) {
    const js = sourceFiles(ctx).filter((f) => JS.test(f) && JSONWEBTOKEN.test(ctx.read(f) ?? ''));
    const py = sourceFiles(ctx).filter((f) => PY.test(f) && PY_IMPORT.test(ctx.read(f) ?? ''));
    return [
      ...matchingLines(ctx, js, JS_LITERAL_KEY).filter(({ text }) => !INTERPOLATED.test(text)),
      ...matchingLines(ctx, py, PY_LITERAL_KEY),
    ].map(({ file, line }) => finding(rule, {
      file, line,
      what: 'passes a literal string as the JWT signing secret/key',
      fix: 'load the secret from the environment or a secret store, and make it >= 32 random bytes (RFC 7518: an HMAC key at least as long as the hash output) — then rotate the committed one',
    }));
  },
};

export default rule;
