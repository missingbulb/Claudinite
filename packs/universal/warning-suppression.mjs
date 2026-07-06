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
  description: 'New warning-suppression markers in the diff need the dedicated-issue path, not the quick path',
  doc: 'packs/universal/RULES.md',
  why: 'suppression hides the signal instead of resolving it',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      // Markers are only live in code — a doc *discussing* them isn't suppressing anything.
      if (file.endsWith('.md')) continue;
      // Pack check modules spell these markers as detection patterns; the engine's
      // tests spell them as fixtures. Neither is a live suppression.
      if (/^packs\//.test(file) || /(^|\/)checks\/test\//.test(file)) continue;
      for (const { line, text } of ctx.addedLines(file)) {
        if (MARKERS.some((m) => m.test(text))) {
          out.push(finding(rule, {
            file, line,
            what: `adds a warning-suppression marker: ${text.trim()}`,
            fix: 'fix the underlying cause instead; if that genuinely can\'t happen now, open a dedicated issue and make the suppression a reviewed decision there',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
