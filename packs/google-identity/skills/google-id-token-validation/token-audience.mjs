import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { matchingLines } from '../../../../engine/checks/helpers/line-scanning.mjs';

// A Google ID token is accepted on three things: signature, issuer, audience.
// Every Google-issued token shares the one issuer, so a validator whose
// expected audience is unset accepts tokens minted for ANY Google OAuth client
// — an authentication bypass that looks completely valid. Repo-state on
// purpose: a pre-existing unset audience is a live bypass and must keep firing
// until fixed, however long ago it merged.
//
// RELEVANCE FIRST (see engine/checks/README.md "Adding a rule"): a skill check runs on
// EVERY repo, so the gate is narrow — only config-format files (yaml/json/toml/
// tf) that use the word "issuer" and carry the bare Google issuer origin
// (scheme + host with no path; a path form is a client-side OAuth URL, not an
// issuer). Code-form verifiers (jose, jsonwebtoken) have no reliable
// file-scoped signature and are not scanned. The skill's own directory is
// excluded so its fixtures never self-flag on the corpus repo.
const SELF = 'skills/google-id-token-validation/';
const CONFIG_EXT = /\.(ya?ml|json|toml|tf)$/;
const BARE_ISSUER = /https:\/\/accounts\.google\.com(?![\w/.-])/;
const ISSUER_WORD = /issuer/i;
const AUD_MENTION = /\baud(ience)?\b/i;
const EMPTY_AUD = /aud(ience)?["']?\s*[:=]\s*(\[\s*\]|""|'')/i;

const rule = {
  id: 'google-token-audience-pinned',
  severity: 'blocking',
  description: 'A validator config declaring the Google accounts issuer pins a non-empty expected audience',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'every Google-issued ID token shares that issuer, so signature + issuer alone accept a token minted for any Google OAuth client — the audience claim is the only thing that scopes a token to this app, and an unset audience is a full authentication bypass',

  run(ctx) {
    const configs = ctx.files.filter((f) => !f.startsWith(SELF) && CONFIG_EXT.test(f));
    return matchingLines(ctx, configs, BARE_ISSUER)
      .filter(({ file }) => {
        const text = ctx.read(file) ?? '';
        return ISSUER_WORD.test(text) && !(AUD_MENTION.test(text) && !EMPTY_AUD.test(text));
      })
      .map(({ file, line }) => finding(rule, {
        file, line,
        what: 'declares the Google accounts issuer with no (or an explicitly empty) expected audience',
        fix: 'configure the validator\'s audience to your exact OAuth web-application client id, next to the issuer; never leave it unset',
      }));
  },
};

export default rule;
