import { dirname } from 'node:path';

// Enforcement-narration scanning, shared by the canon's skill-side and
// pack-side narration rules. A canon doc must not narrate its own enforcement:
// checks run automatically at every Stop and in CI, and each failure message
// carries its rule — prose that tells the reader to run the checks runner, or
// that names a rule id defined beside it, duplicates the mechanism and drifts
// from it. Generic on purpose (takes the doc path; owns no pack or skill
// names), so it stays engine per extending.md.
const RUNNER = /checks\/run\.mjs/;
const RULE_ID = /\bid:\s*'([a-z][\w-]+)'/g;

// Rule ids defined by the .mjs modules directly in `dir` (the doc's own rules).
// A pack.mjs manifest is excluded — its `id` is the pack's own name, which the
// prose legitimately says — as are test files, whose fixtures define throwaway
// ids.
export function ownRuleIds(ctx, dir) {
  const ids = new Set();
  for (const f of ctx.files) {
    if (dirname(f) !== dir || !f.endsWith('.mjs')) continue;
    if (f.endsWith('/pack.mjs') || f.endsWith('.test.mjs')) continue;
    const src = ctx.read(f);
    if (src === null) continue;
    for (const m of src.matchAll(RULE_ID)) ids.add(m[1]);
  }
  return ids;
}

// An id mention bounded so one id never matches inside a longer kebab name
// (`foo` inside `foo-release`) or a URL scheme.
const mentions = (line, id) =>
  new RegExp(`(^|[^\\w-])${id.replace(/[-]/g, '\\-')}([^\\w-]|$)`).test(line);

// Narration violations in `doc`: each is { line, what, fix }, ready to wrap in
// a finding by the owning rule.
export function narrationViolations(ctx, doc) {
  const text = ctx.read(doc);
  if (text === null) return [];
  const lines = text.split('\n');
  const out = [];
  const runner = lines.findIndex((ln) => RUNNER.test(ln));
  if (runner !== -1) {
    out.push({
      line: runner + 1,
      what: 'tells the reader to run the checks runner',
      fix: 'delete the instruction — the Stop hook and CI run every check on their own',
    });
  }
  for (const id of [...ownRuleIds(ctx, dirname(doc))].sort()) {
    const line = lines.findIndex((ln) => mentions(ln, id));
    if (line === -1) continue;
    out.push({
      line: line + 1,
      what: `names its own check rule "${id}"`,
      fix: 'remove the mention — the rule announces itself when it fires, and its failure message carries the instruction',
    });
  }
  return out;
}
