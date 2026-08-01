import { finding } from '../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';

// Converted from RULES.md §5 ("Determinism or it isn't spec"): the spec's clock
// is ONE shared reference time threaded through everything that formats or
// compares dates — never the wall clock. A case that reads the real clock is not
// a flaky test, it is a spec that stops being true: the golden an owner approved
// today renders differently tomorrow ("2 minutes ago" → "yesterday"), and the
// refresh lane re-baselines the drift into the committed expected, so the
// requirement quietly changes without anyone deciding to change it.
//
// A wall-clock call is a static signature in the case's own source, so it
// converts — but only where absence of a legitimate reason is provable, which
// fixes the scope below.
//
// SCOPE — the cases, not the whole tree. Judged files are the ones the framework
// itself names as cases (§1: `<kind>/cases/<slug>.<leaf-id>.case.<ext>`): a file
// under a `cases/` directory inside the requirements tree, or one named
// `*.case.*` there. The runners, gates and harness that share that tree are NOT
// judged — a runner legitimately times its own run or stamps a failures
// directory, and firing there would be the check inventing a rule the prose
// never stated. The tree's root is the configured spec's own directory, so a
// project whose spec lives outside the canonical path is judged in the right
// place; no spec in the repo at all ⇒ nothing to judge, return [].
//
// PARSED, NOT GREPPED, twice over:
//   - Comments are stripped first (string-aware), so a case documenting the
//     gotcha — "never Date.now() here, use REFERENCE_NOW" — never fires it.
//   - The call, not the name, is the violation: the patterns all demand the
//     opening paren, so installing a fake (`Date.now = () => REFERENCE_NOW`,
//     `spyOn(Date, 'now')`) reads as clean, which it is.
// String literals are deliberately NOT blanked: `${Date.now()}` inside a
// template or a Dart interpolation is a real read of the real clock, and a case
// that merely quotes the token as data is not a shape that occurs.
//
// Only the wall-clock half of the §5 bullet converts. "Fixture data is authored
// relative to it" is a convention no scan can judge (whether a literal date was
// derived from REFERENCE_NOW is invisible), and the rest of §5 — faked network,
// randomness, locale, viewport, fonts — has no bounded token list. That is why
// the paragraph stays whole beside this check.

const DEFAULT_SPEC = 'dev/requirements/requirements.md';
const JUDGED = /\.(mjs|cjs|jsx?|tsx?|dart)$/i;

// The wall-clock reads of the two stacks §6 documents (JS/TS, Dart). Each demands
// the call's own opening paren; `new Date(...)` is listed only in its argument-less
// form, since `new Date(REFERENCE_NOW)` is exactly the right thing to write.
const CLOCKS = [
  ['Date.now()', /\bDate\.now\s*\(/g],
  ['new Date()', /\bnew\s+Date\s*\(\s*\)/g],
  ['DateTime.now()', /\bDateTime\.now\s*\(/g],
  ['DateTime.timestamp()', /\bDateTime\.timestamp\s*\(/g],
];

function specPath(ctx) {
  const configured = ctx.config?.packConfig?.['executable-requirements']?.spec;
  return typeof configured === 'string' && configured ? configured : DEFAULT_SPEC;
}

// The requirements tree's root — the spec file's own directory, with a trailing
// slash so it prefix-matches paths and nothing else.
const treeRoot = (spec) => (spec.includes('/') ? `${spec.slice(0, spec.lastIndexOf('/'))}/` : '');

const isCase = (file, root) => {
  if (!file.startsWith(root) || !JUDGED.test(file)) return false;
  const rest = file.slice(root.length);
  return rest.includes('/cases/') || /(^|\/)[^/]*\.case\.[^/]+$/.test(rest);
};

const rule = {
  id: 'requirements-case-wall-clock',
  severity: 'blocking',
  description: 'A requirements case reads no wall clock — the spec\'s time is the one pinned reference time',
  doc: 'packs/executable-requirements/RULES.md',
  why: 'a case that reads the real clock has no stable expected: the golden the owner approved renders differently tomorrow, and the refresh lane bakes that drift into the committed expected — the requirement changes without anyone deciding to',

  run(ctx) {
    const spec = specPath(ctx);
    if (!ctx.exists(spec)) return [];
    const root = treeRoot(spec);

    const out = [];
    for (const file of ctx.files) {
      if (!isCase(file, root)) continue;
      const raw = ctx.read(file);
      if (raw === null) continue;
      const src = stripComments(raw);
      const hits = [];
      for (const [name, pattern] of CLOCKS) {
        pattern.lastIndex = 0;
        for (let m = pattern.exec(src); m; m = pattern.exec(src)) hits.push({ name, at: m.index });
      }
      // Reported in source order, not pattern order — a reader walks the file top-down.
      for (const { name, at } of hits.sort((a, b) => a.at - b.at)) {
        out.push(finding(rule, {
          file,
          line: src.slice(0, at).split('\n').length,
          what: `this requirements case reads the wall clock (\`${name}\`)`,
          fix: 'take the time from the spec\'s one shared reference time (REFERENCE_NOW) — thread it into whatever formats or compares dates here, and author this case\'s fixture data relative to it, so the expected stays byte-stable forever',
        }));
      }
    }
    return out;
  },
};

export default rule;
