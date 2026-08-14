import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';
import clientIdSingleOrigin from './client-id-single-origin.mjs';

// The check-the-work rules validating this skill's action — wiring server-side
// validation of Google Sign-In ID tokens. Discovered by engine/pack_loader/pack-registry.mjs and
// run at every Stop and in CI; each is inert until a Google-validator artifact
// exists (its RELEVANCE FIRST gate). The failure messages carry the rules —
// there is deliberately no prose copy to drift from. The two declared checks are
// pattern specs, not code — vocabulary in the pattern-rules helper's header.
const BARE_ISSUER = /https:\/\/accounts\.google\.com(?![\w/.-])/;
const ISSUER_WORD = /issuer/i;
const EMPTY_AUD = /aud(ience)?["']?\s*[:=]\s*(\[\s*\]|""|'')/i;
const AUDIENCE_WHAT = 'declares the Google accounts issuer with no (or an explicitly empty) expected audience';
const AUDIENCE_FIX = 'configure the validator\'s audience to your exact OAuth web-application client id, next to the issuer; never leave it unset';
const CLAIMS_CONTEXT = /requestContext\s*\.\s*authorizer|jwt\.claims|verifyIdToken|jwtVerify/;

export const tokenAudience = patternRule({
  id: 'google-token-audience-pinned',
  severity: 'blocking',
  description: 'A validator config declaring the Google accounts issuer pins a non-empty expected audience',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'every Google-issued ID token shares that issuer, so signature + issuer alone accept a token minted for any Google OAuth client — the audience claim is the only thing that scopes a token to this app, and an unset audience is a full authentication bypass',
  scanFiles: /\.(ya?ml|json|toml|tf)$/,
  excludeFiles: /^skills\/google-id-token-validation\//,
  matchLines: [
    { match: BARE_ISSUER, whenFileMatches: ISSUER_WORD, unlessFileMatches: /\baud(ience)?\b/i, what: AUDIENCE_WHAT, fix: AUDIENCE_FIX },
    { match: BARE_ISSUER, whenFileMatches: [ISSUER_WORD, EMPTY_AUD], what: AUDIENCE_WHAT, fix: AUDIENCE_FIX },
  ],
});

export const emailVerified = patternRule({
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

export default [tokenAudience, clientIdSingleOrigin, emailVerified];
