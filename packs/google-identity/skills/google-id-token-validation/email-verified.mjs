import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';

const CLAIMS_CONTEXT = /requestContext\s*\.\s*authorizer|jwt\.claims|verifyIdToken|jwtVerify/;

export default patternRule({
  id: 'google-token-email-verified',
  severity: 'blocking',
  description: 'Handler code trusts a Google ID token\'s email claim only when email_verified says so, compared as the authorizer delivers it',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'a Google ID token carries email regardless of verification — an action gated on the bare claim trusts an address Google has not verified; and behind an API Gateway JWT authorizer the claim arrives as a string, so a strict boolean compare silently rejects every genuinely-verified user',
  scanFiles: /\.(mjs|cjs|jsx?|tsx?|py)$/,
  excludeFiles: /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.|^skills\/google-id-token-validation\//,
  relevantWhen: { repoContains: /accounts\.google\.com|\.apps\.googleusercontent\.com/ },
  matchLines: [
    {
      match: /\b(claims|payload)\??\.email\b(?!_)|(claims|payload)\[['"]email['"]\]/,
      whenFileMatches: CLAIMS_CONTEXT,
      unlessFileMatches: /email_verified/,
      what: 'reads the token\'s email claim but never checks email_verified',
      fix: 'gate any identity-bearing action on the email_verified claim being true (behind an API Gateway JWT authorizer it arrives as the string \'true\')',
    },
    {
      match: /email_verified\W{0,4}\s*[!=]==\s*(true|false)\b/,
      whenFileMatches: [CLAIMS_CONTEXT, /requestContext/],
      what: 'compares email_verified to a boolean with strict equality behind an API Gateway authorizer',
      fix: 'compare against the string \'true\' (or coerce) — the authorizer stringifies claims, so a strict boolean compare rejects every verified user',
    },
  ],
});
