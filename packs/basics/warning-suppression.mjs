import { finding } from '../../checks/lib/findings.mjs';

const MARKERS = [
  /eslint-disable/,
  /@ts-ignore/,
  /@ts-nocheck/,
  /\bnoqa\b/,
  /pylint:\s*disable/,
  /@SuppressWarnings/,
  /#\s*type:\s*ignore/,
];

const rule = {
  id: 'warning-suppression',
  severity: 'blocking',
  description: 'Warning-suppression markers need the dedicated-issue path, not the quick path',
  doc: 'packs/basics/RULES.md',
  why: 'suppression hides the signal instead of resolving it',

  // Check-the-world, not check-the-work: a suppression marker is a repo-state
  // property, so scan every line of every in-scope file (the whole repo under the
  // engine's default `all` sweep), not just lines this change added. A legacy or
  // deliberately-kept suppression is handled by the project's `accept` entry in
  // .claudinite-checks.json (reason required), not by only ever looking at the diff.
  run(ctx) {
    const out = [];
    // ctx.files already excludes vendored/generated files (recorded fixtures,
    // machine-written output) — a marker inside those isn't the project's suppression
    // decision, so the engine drops them from the sweep for every check.
    for (const file of ctx.files) {
      // Markers are only live in code — a doc *discussing* them isn't suppressing anything.
      if (file.endsWith('.md')) continue;
      // Pack check modules spell these markers as detection patterns; the engine's
      // tests spell them as fixtures. Neither is a live suppression. Under a full
      // sweep these skips are load-bearing (in consuming repos the mounted corpus
      // is gitignored/submodule and never in ctx.files, so they only fire here).
      if (/^packs\//.test(file) || /(^|\/)checks\/test\//.test(file)) continue;
      const text = ctx.read(file);
      if (text === null) continue;
      text.split('\n').forEach((lineText, i) => {
        if (MARKERS.some((m) => m.test(lineText))) {
          out.push(finding(rule, {
            file, line: i + 1,
            what: `carries a warning-suppression marker: ${lineText.trim()}`,
            fix: 'fix the underlying cause instead; if that genuinely can\'t happen now, open a dedicated issue and make the suppression a reviewed decision there — or, for one you\'re deliberately keeping, accept it in .claudinite-checks.json with a reason',
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
