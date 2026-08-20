import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../../engine/checks/helpers/work.mjs';
import rule, { packsTouched, declaredPackVersion } from './pack-version-bumped.mjs';

const manifest = (version) => `export default {\n  id: 'demo',\n  version: ${version},\n  minEngineVersion: 3,\n};\n`;

// The work context a work rule receives — only the three members this rule reads.
const work = (changedFiles, files = {}, base = {}) => ({
  changedFiles,
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

const run = (...args) => rule.run(work(...args));

// --- which changes are in scope ---------------------------------------------

test('a pack directory is touched by any file under it, each pack once', () => {
  assert.deepEqual(
    packsTouched(['packs/demo/RULES.md', 'packs/demo/skills/x/SKILL.md', 'packs/other/pack.mjs']),
    ['demo', 'other'],
  );
});

test('the packs tree\'s own files are not a pack — they ship with the engine, not a directory copy', () => {
  assert.deepEqual(packsTouched(['packs/README.md', 'packs/directory.GENERATED.md']), []);
});

test('the canon\'s own local packs are out of scope — they vendor nowhere and reach no member', () => {
  assert.deepEqual(packsTouched(['.claudinite/local/packs/claudinite/RULES.md']), []);
});

test('a pack\'s own tests are out of scope — no vendor set carries one, so no member is waiting', () => {
  assert.deepEqual(packsTouched(['packs/demo/pack.test.mjs', 'packs/demo/skills/x/rule.test.mjs']), []);
  // The pack is still touched when a shipping file changes in the same commit.
  assert.deepEqual(packsTouched(['packs/demo/pack.test.mjs', 'packs/demo/RULES.md']), ['demo']);
});

// --- reading the declared version -------------------------------------------

test('the manifest\'s own version is read, never minEngineVersion beside it', () => {
  assert.equal(declaredPackVersion(manifest(2)), 2);
  assert.equal(declaredPackVersion("export default { id: 'demo', minEngineVersion: 4 };\n"), null);
});

// --- the invariant ----------------------------------------------------------

test('editing a pack without bumping its version fires, naming the next version', () => {
  const findings = run(['packs/demo/RULES.md'], { 'packs/demo/pack.mjs': manifest(1) }, { 'packs/demo/pack.mjs': manifest(1) });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'blocking');
  assert.equal(findings[0].file, 'packs/demo/pack.mjs');
  assert.match(findings[0].what, /leaves its version at 1/);
  // The remedy is today's next version, so it is matched by shape rather than pinned
  // to a value that would go stale overnight.
  assert.match(findings[0].fix, /to '\d{5,6}\.1'/);
});

test('a bump alongside the edit passes', () => {
  assert.deepEqual(run(['packs/demo/RULES.md', 'packs/demo/pack.mjs'], { 'packs/demo/pack.mjs': manifest(2) }, { 'packs/demo/pack.mjs': manifest(1) }), []);
});

test('a version that moves backwards fires — every member would read it as "already current"', () => {
  const findings = run(['packs/demo/pack.mjs'], { 'packs/demo/pack.mjs': manifest(1) }, { 'packs/demo/pack.mjs': manifest(3) });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /backwards, 3 → 1/);
});

test('a pack this change introduces needs no bump — its first version ships to everyone', () => {
  assert.deepEqual(run(['packs/demo/pack.mjs', 'packs/demo/RULES.md'], { 'packs/demo/pack.mjs': manifest(1) }, {}), []);
});

test('a pack this change deletes needs no bump — there is no manifest left to bump', () => {
  assert.deepEqual(run(['packs/demo/pack.mjs', 'packs/demo/RULES.md'], {}, { 'packs/demo/pack.mjs': manifest(1) }), []);
});

test('each unbumped pack is reported separately — they are separate directory copies', () => {
  const files = { 'packs/a/pack.mjs': manifest(1), 'packs/b/pack.mjs': manifest(5) };
  const findings = run(['packs/a/RULES.md', 'packs/b/RULES.md'], files, files);
  assert.deepEqual(findings.map((f) => f.file), ['packs/a/pack.mjs', 'packs/b/pack.mjs']);
});

test('a change touching no pack is silent', () => {
  assert.deepEqual(run(['engine/version.mjs']), []);
});

// --- through the real work context ------------------------------------------
// The stub above fixes what `read`/`readBase` answer; this proves the rule reads
// the same pair off a real branch, base = the merge-base.

test('end to end: an unbumped pack edit on a branch fires against the merge-base', () => {
  const root = makeRepo({
    base: { 'packs/demo/pack.mjs': manifest(1), 'packs/demo/RULES.md': '# Demo\n' },
    changed: { 'packs/demo/RULES.md': '# Demo\n\nA new rule.\n' },
  });
  try {
    const findings = runRule(rule, buildContext({ root, mode: 'changed' }));
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /leaves its version at 1/);
  } finally { cleanup(root); }
});

test('end to end: the same edit with the bump is silent', () => {
  const root = makeRepo({
    base: { 'packs/demo/pack.mjs': manifest(1), 'packs/demo/RULES.md': '# Demo\n' },
    changed: { 'packs/demo/pack.mjs': manifest(2), 'packs/demo/RULES.md': '# Demo\n\nA new rule.\n' },
  });
  try {
    assert.deepEqual(runRule(rule, buildContext({ root, mode: 'changed' })), []);
  } finally { cleanup(root); }
});
