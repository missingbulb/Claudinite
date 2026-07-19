import { finding } from '../../checks/lib/findings.mjs';

// A Google ID token carries an email claim regardless of verification; it is
// trustworthy only together with email_verified. Two static signatures in
// handler code: (a) reading the email claim in a file that never mentions
// email_verified; (b) comparing email_verified to a boolean with strict
// equality behind an API Gateway JWT authorizer, which stringifies claims — the
// claim arrives as the string 'true', so a strict boolean compare silently
// rejects every genuinely-verified user.
//
// RELEVANCE FIRST: a skill check runs on EVERY repo, and email_verified is
// standard OIDC, so two gates keep this Google-scoped: per file, only
// non-test code files handling verified-token claims (an authorizer context or
// a verify call); per repo, only when some file carries a Google identity
// marker (the accounts issuer or a googleusercontent client id) — evaluated
// lazily, once a candidate finding exists. The skill's own directory is
// excluded so its fixtures never self-flag on the corpus repo.
const SELF = 'skills/google-id-token-validation/';
const CODE_EXT = /\.(mjs|cjs|jsx?|tsx?|py)$/;
const TESTISH = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\./;
const CLAIMS_CONTEXT = /requestContext\s*\.\s*authorizer|jwt\.claims|verifyIdToken|jwtVerify/;
const EMAIL_ACCESS = /\b(claims|payload)\??\.email\b(?!_)|(claims|payload)\[['"]email['"]\]/;
const STRICT_BOOL = /email_verified\W{0,4}\s*[!=]==\s*(true|false)\b/;
const GOOGLE_MARKER = /accounts\.google\.com|\.apps\.googleusercontent\.com/;

const rule = {
  id: 'google-token-email-verified',
  severity: 'blocking',
  description: 'Handler code trusts a Google ID token\'s email claim only when email_verified says so, compared as the authorizer delivers it',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'a Google ID token carries email regardless of verification — an action gated on the bare claim trusts an address Google has not verified; and behind an API Gateway JWT authorizer the claim arrives as a string, so a strict boolean compare silently rejects every genuinely-verified user',

  run(ctx) {
    const candidates = [];
    for (const f of ctx.files) {
      if (f.startsWith(SELF) || !CODE_EXT.test(f) || TESTISH.test(f)) continue;
      const text = ctx.read(f);
      if (text === null || !CLAIMS_CONTEXT.test(text)) continue;
      const lines = text.split('\n');
      if (EMAIL_ACCESS.test(text) && !/email_verified/.test(text)) {
        candidates.push(finding(rule, {
          file: f, line: lines.findIndex((ln) => EMAIL_ACCESS.test(ln)) + 1,
          what: 'reads the token\'s email claim but never checks email_verified',
          fix: 'gate any identity-bearing action on the email_verified claim being true (behind an API Gateway JWT authorizer it arrives as the string \'true\')',
        }));
      }
      if (/requestContext/.test(text) && STRICT_BOOL.test(text)) {
        candidates.push(finding(rule, {
          file: f, line: lines.findIndex((ln) => STRICT_BOOL.test(ln)) + 1,
          what: 'compares email_verified to a boolean with strict equality behind an API Gateway authorizer',
          fix: 'compare against the string \'true\' (or coerce) — the authorizer stringifies claims, so a strict boolean compare rejects every verified user',
        }));
      }
    }
    if (candidates.length === 0) return [];
    const googleRepo = ctx.files.some((f) => {
      if (f.startsWith(SELF)) return false;
      const text = ctx.read(f);
      return text !== null && GOOGLE_MARKER.test(text);
    });
    return googleRepo ? candidates : [];
  },
};

export default rule;
