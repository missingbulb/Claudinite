import { finding } from '../../checks/lib/findings.mjs';

// The OAuth client id is one value used in two roles: the client requests the
// ID token FOR it (it becomes the token's audience claim) and the validator is
// configured to EXPECT it. Each deploy unit should source it from a single
// origin (one build-time constant, one deploy parameter); independently-edited
// copies drift, and a drifted pair rejects every well-formed token with an
// opaque 401 that looks like a bug anywhere except the mismatched literal.
// Advisory by kind: separate deploy units (a client bundle and a server stack)
// legitimately each carry one copy, so a duplicate is a smell to judge, not a
// certain defect.
//
// RELEVANCE FIRST: a skill check runs on EVERY repo. The client-id literal
// (…apps.googleusercontent.com with escaped dots below) is itself the narrow
// gate — repos without one contribute nothing. The skill's own directory is
// excluded so its fixtures never self-flag on the corpus repo.
const SELF = 'skills/google-id-token-validation/';
const CLIENT_ID = /[A-Za-z0-9][\w-]*\.apps\.googleusercontent\.com/g;

const rule = {
  id: 'google-client-id-single-origin',
  severity: 'advisory',
  description: 'A Google OAuth client-id literal appears in at most one file per deploy unit, not as scattered copies',
  doc: 'skills/google-id-token-validation/SKILL.md',
  why: 'the client requests the token for this id and the validator expects it as audience — one value; independently-edited copies drift, and a drifted pair rejects every well-formed token with an opaque 401',

  run(ctx) {
    const byLiteral = new Map(); // literal -> [{file, line}] first hit per file
    for (const f of ctx.files) {
      if (f.startsWith(SELF)) continue;
      const text = ctx.read(f);
      if (text === null) continue;
      const seen = new Set();
      const lines = text.split('\n');
      lines.forEach((ln, i) => {
        for (const m of ln.matchAll(CLIENT_ID)) {
          if (seen.has(m[0])) continue;
          seen.add(m[0]);
          byLiteral.set(m[0], [...(byLiteral.get(m[0]) ?? []), { file: f, line: i + 1 }]);
        }
      });
    }
    const out = [];
    for (const [literal, hits] of [...byLiteral.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (hits.length < 2) continue;
      out.push(finding(rule, {
        file: hits[1].file, line: hits[1].line,
        what: `hardcodes the OAuth client id ${literal}, also present in ${hits.filter((h) => h !== hits[1]).map((h) => h.file).join(', ')}`,
        fix: 'keep one authoritative copy per deploy unit and derive the rest (import the constant, read the manifest, pass a deploy parameter); confirm a cross-unit pair is deliberate',
      }));
    }
    return out;
  },
};

export default rule;
