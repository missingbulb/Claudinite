import { dirname } from 'node:path';

// Generic scanning helpers for checks. The caller owns which files matter and
// which tokens are forbidden or required — these helpers only do the walking,
// so a check that must assert a word's presence or absence over a file set
// stays a few lines long.

// Every line in `files` where `re` matches: [{ file, line, text }], 1-indexed,
// ready to anchor findings. Pass a non-global regex.
export function matchingLines(ctx, files, re) {
  const out = [];
  for (const f of files) {
    const text = ctx.read(f);
    if (text === null) continue;
    text.split('\n').forEach((ln, i) => {
      if (re.test(ln)) out.push({ file: f, line: i + 1, text: ln });
    });
  }
  return out;
}

// Rule ids (`id: '...'`) declared by the rule modules directly in `dir` —
// introspection of the engine's own rule-module format, not content knowledge.
// Pack manifests are skipped (their id is the pack's name, not a rule's), as
// are test files (their fixtures declare throwaway ids).
export function ruleIdsIn(ctx, dir) {
  const ids = new Set();
  for (const f of ctx.files) {
    if (dirname(f) !== dir || !f.endsWith('.mjs')) continue;
    if (f.endsWith('/pack.mjs') || f.endsWith('.test.mjs')) continue;
    const src = ctx.read(f);
    if (src === null) continue;
    for (const m of src.matchAll(/\bid:\s*'([a-z][\w-]+)'/g)) ids.add(m[1]);
  }
  return ids;
}
