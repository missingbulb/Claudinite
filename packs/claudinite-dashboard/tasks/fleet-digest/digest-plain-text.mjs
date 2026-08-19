import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// The brief is DELIVERED, not read on GitHub. An ad-hoc session reads `digests/<date>.md`
// and sends it as a notification verbatim (digests/README.md, "Getting it read"), and the
// notification renderer that carries it does two things this rule exists for:
//
//   IT DOES NOT PARSE MARKDOWN. `#`, `##`, `-`, `**bold**`, backticks and `[#750](url)`
//   all arrive as literal characters, so a brief written in markdown reaches the owner as
//   its own source code.
//   IT COLLAPSES WHITESPACE. Every newline and blank line is gone — four bullets and two
//   sections arrive as one running paragraph — so nothing structural may depend on a line
//   break surviving.
//
// Together those make markdown strictly worse than plain text here: the syntax costs the
// reader attention and buys the structure it normally pays for exactly nowhere. So the
// brief is plain text that reads correctly collapsed — a "• " opening each item is the
// separator that survives, and a bare URL is left bare because the renderer autolinks it.
//
// Scope is the dated briefs only. `digests/README.md` is documentation about the series,
// is read on GitHub, is never sent, and is markdown on purpose.
//
// BLOCKING: an unreadable brief is the task's entire output failing, and it fails silently
// — the file is well-formed, the run is green, and only the owner's inbox shows it.
const BRIEF = /^digests\/\d{4}-\d\d-\d\d\.md$/;

// Each syntax the renderer shows raw, with the plain-text form that replaces it. Ordered
// as a reader meets them; the fix text names the replacement so a finding is actionable
// without opening this file.
const SYNTAX = [
  { what: 'an ATX heading', re: /^ {0,3}#{1,6}\s/, fix: 'a bare line of text' },
  { what: 'a list bullet', re: /^ {0,3}[-*+]\s/, fix: '"• ", which stays a visible separator once the newlines collapse' },
  { what: 'an inline link', re: /\[[^\]\n]*\]\([^)\n]*\)/, fix: 'the bare URL at the end of the item — the renderer autolinks it' },
  { what: 'asterisk emphasis', re: /\*/, fix: 'nothing; the words carry it' },
  { what: 'a backtick', re: /`/, fix: 'plain text, or double quotes where a quotation is genuinely needed' },
  { what: 'underscore emphasis', re: /(^|\s)_[^_\s][^_\n]*_(?=$|[\s.,;:)])/, fix: 'nothing; the words carry it' },
];

const rule = {
  id: 'digest-plain-text',
  severity: 'blocking',
  description: 'every dated brief under digests/ is plain text — no markdown syntax the notification renderer would show raw',
  doc: 'packs/claudinite-dashboard/tasks/fleet-digest/digest-plain-text.mjs',
  why: 'the brief is sent verbatim through a renderer that neither parses markdown nor keeps line breaks, so any markdown in it reaches the owner as literal characters in one running paragraph',

  run(ctx) {
    const out = [];
    for (const file of ctx.allFiles) {
      if (!BRIEF.test(file)) continue;
      const text = ctx.read(file);
      if (text === null) continue;

      // First offence per syntax, and the earliest line among them — one finding per
      // file, pointing at the first place the reader would see it break.
      const lines = text.split('\n');
      const hits = [];
      for (const s of SYNTAX) {
        const i = lines.findIndex((l) => s.re.test(l));
        if (i !== -1) hits.push({ ...s, line: i + 1 });
      }
      if (hits.length === 0) continue;

      hits.sort((a, b) => a.line - b.line);
      out.push(finding(rule, {
        file,
        line: hits[0].line,
        what: `contains ${hits.map((h) => `${h.what} (line ${h.line})`).join(', ')} — the renderer shows each of these raw`,
        fix: hits.map((h) => `replace ${h.what} with ${h.fix}`).join('; '),
      }));
    }
    return out;
  },
};

export default rule;
