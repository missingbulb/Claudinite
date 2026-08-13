import { patternRule } from '../../../../engine/checks/helpers/pattern-rules.mjs';

const BARE_ISSUER = /https:\/\/accounts\.google\.com(?![\w/.-])/;
const ISSUER_WORD = /issuer/i;
const EMPTY_AUD = /aud(ience)?["']?\s*[:=]\s*(\[\s*\]|""|'')/i;
const WHAT = 'declares the Google accounts issuer with no (or an explicitly empty) expected audience';
const FIX = 'configure the validator\'s audience to your exact OAuth web-application client id, next to the issuer; never leave it unset';

export default patternRule({
  id: 'google-token-audience-pinned',
  severity: 'blocking',
  description: 'A validator config declaring the Google accounts issuer pins a non-empty expected audience',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'every Google-issued ID token shares that issuer, so signature + issuer alone accept a token minted for any Google OAuth client — the audience claim is the only thing that scopes a token to this app, and an unset audience is a full authentication bypass',
  files: /\.(ya?ml|json|toml|tf)$/,
  exclude: /^skills\/google-id-token-validation\//,
  line: [
    { match: BARE_ISSUER, when: ISSUER_WORD, unlessFile: /\baud(ience)?\b/i, what: WHAT, fix: FIX },
    { match: BARE_ISSUER, when: [ISSUER_WORD, EMPTY_AUD], what: WHAT, fix: FIX },
  ],
});
