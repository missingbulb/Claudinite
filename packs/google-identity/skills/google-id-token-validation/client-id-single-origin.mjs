import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { addedLines } from '../../../../engine/checks/helpers/line-scanning.mjs';

// The OAuth client id is one value in two roles: the client requests the ID
// token FOR it (it becomes the token's audience claim) and the validator is
// configured to EXPECT it. Each deploy unit sources it from a single origin;
// an independently-edited copy drifts, and a drifted pair rejects every
// well-formed token with an opaque 401. Advisory, and scoped to the WORK: it
// fires when the current change adds a copy of a literal that already lives in
// another file — legacy duplicates on the base are the world, not this change,
// so a repo converges without acceptances for history the work never touched.
//
// RELEVANCE FIRST (see engine/checks/README.md "Adding a rule"): the client-id
// literal (…apps.googleusercontent.com, escaped dots below) is itself the
// narrow gate. The skill's own directory is excluded so its fixtures never
// self-flag on the corpus repo.
const SELF = 'skills/google-id-token-validation/';
const CLIENT_ID = /[A-Za-z0-9][\w-]*\.apps\.googleusercontent\.com/g;

const rule = {
  id: 'google-client-id-single-origin',
  severity: 'advisory',
  description: 'A change does not add a copy of a Google OAuth client-id literal that already lives in another file',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'the client requests the token for this id and the validator expects it as audience — one value; independently-edited copies drift, and a drifted pair rejects every well-formed token with an opaque 401',

  run(ctx) {
    const out = [];
    for (const { file, line, text } of addedLines(ctx)) {
      if (file.startsWith(SELF)) continue;
      for (const literal of new Set([...text.matchAll(CLIENT_ID)].map((m) => m[0]))) {
        const elsewhere = ctx.files.filter((f) =>
          f !== file && !f.startsWith(SELF) && (ctx.read(f) ?? '').includes(literal));
        if (elsewhere.length === 0) continue;
        out.push(finding(rule, {
          file, line,
          what: `adds a copy of the OAuth client id ${literal}, already present in ${elsewhere.join(', ')}`,
          fix: 'derive it from the existing origin (import the constant, read the manifest, pass a deploy parameter) instead of pasting a second copy; confirm a cross-deploy-unit pair is deliberate',
        }));
      }
    }
    return out;
  },
};

export default rule;
