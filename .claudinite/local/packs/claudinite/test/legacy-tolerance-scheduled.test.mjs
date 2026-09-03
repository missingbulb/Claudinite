import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { loadDeclaredChecks } from '../../../../../engine/checks/helpers/pattern-rules.mjs';

const rule = loadDeclaredChecks(
  fileURLToPath(new URL('..', import.meta.url)),
).find((r) => r.id === 'legacy-tolerance-scheduled');

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));
const at = (files) => makeRepo({ base: files });

const ANNOTATION = '// @legacy-tolerance advisory:legacy-shape-in-use retire:#1640';

test('legacy-tolerance-scheduled: an annotated tolerance passes', () => {
  const root = at({ 'engine/x.mjs': `${ANNOTATION}\nexport const LEGACY_KEY = 'old';\n` });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('legacy-tolerance-scheduled: an unannotated tolerance is reported at its own line', () => {
  const root = at({ 'engine/x.mjs': "// a comment that is not an annotation\nexport const LEGACY_KEY = 'old';\n" });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].fix, /@legacy-tolerance advisory:/);
  } finally { cleanup(root); }
});

// Every declaration form the corpus actually uses, exported or not — a tolerance
// hidden behind a bare `const` is the one most likely to be forgotten.
test('legacy-tolerance-scheduled: catches every top-level declaration form', () => {
  const forms = [
    "export const LEGACY_A = 1;",
    "const LEGACY_B = 2;",
    "let LEGACY_C = 3;",
    "function normalizeLegacyThing() {}",
    "async function readLegacyRow() {}",
    "export const isLegacyVersion = (v) => v;",
  ];
  const root = at({ 'packs/p/x.mjs': `${forms.join('\n')}\n` });
  try { assert.equal(run(root).length, forms.length); } finally { cleanup(root); }
});

// A local `const legacy = …` inside a function is a variable, not a tolerance
// point; anchoring at column 0 is what tells them apart.
test('legacy-tolerance-scheduled: ignores locals, comments and out-of-scope trees', () => {
  const root = at({
    'engine/x.mjs': "function f(raw) {\n  const legacyVersions = raw.old;\n  return legacyVersions;\n}\n",
    'engine/y.mjs': "// export const LEGACY_KEY = 'old';\n",
    'dev/tools/z.mjs': "export const LEGACY_KEY = 'old';\n",
    'engine-tests/x.test.mjs': "export const LEGACY_KEY = 'old';\n",
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('legacy-tolerance-scheduled: an annotation the register cannot parse is reported', () => {
  for (const bad of [
    '// @legacy-tolerance retire:#1640',
    '// @legacy-tolerance advisory:none',
    '// @legacy-tolerance advisory:none retire:1640',
    '// @legacy-tolerance advisory:none retire:#1640 (until the fleet drains)',
  ]) {
    const root = at({ 'engine/x.mjs': `${bad}\nexport const LEGACY_KEY = 'old';\n` });
    try {
      const findings = run(root);
      assert.equal(findings.length, 1, bad);
      assert.match(findings[0].what, /not a readable tolerance annotation/, bad);
    } finally { cleanup(root); }
  }
});

// The check's whole point is the tree it ships beside, so a fixture agreeing with
// it proves nothing on its own: the real corpus must come back silent too.
test('legacy-tolerance-scheduled: silent against the real canon tree', () => {
  const root = fileURLToPath(new URL('../../../../..', import.meta.url));
  const findings = run(root);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line}`), []);
  // …and it is scanning something: every annotation in the tree passed it.
  const annotated = execFileSync('git', ['grep', '-c', '@legacy-tolerance', '--', 'engine', 'packs'], { cwd: root, encoding: 'utf8' });
  assert.ok(annotated.split('\n').filter(Boolean).length > 5, 'the real tree carries annotated tolerances to judge');
});
