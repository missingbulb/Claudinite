import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { packConventions, applyPackConventions, bundledSkillDirs, ruleModuleFiles } from '../../engine/pack_loader/pack-conventions.mjs';
import { discoverPacks } from '../../engine/pack_loader/pack-registry.mjs';
import { removeTree } from '../../engine/remove-tree.mjs';

// A pack directory built from a file map, so each case says only what it is about.
function packDir(files) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-conventions-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test('the tree answers for id, prose, badge and skills, and silence for the fingerprint', () => {
  const dir = packDir({
    'pack.mjs': 'export default {};\n',
    'RULES.md': '# rules\n',
    'badge.svg': '<svg/>\n',
    'skills/alpha/SKILL.md': '# alpha\n',
    'skills/beta/SKILL.md': '# beta\n',
  });
  try {
    assert.deepEqual(packConventions(dir, 'demo'), {
      id: 'demo',
      skills: ['alpha', 'beta'],
      detect: null,
      marker: null,
      prose: 'RULES.md',
      badge: 'badge.svg',
    });
  } finally { removeTree(dir); }
});

test('a file that is not there contributes no field at all', () => {
  const dir = packDir({ 'pack.mjs': 'export default {};\n' });
  try {
    const c = packConventions(dir, 'bare');
    assert.deepEqual(c, { id: 'bare', skills: [], detect: null, marker: null });
    assert.equal('prose' in c, false);
    assert.equal('badge' in c, false);
  } finally { removeTree(dir); }
});

// A skill directory may carry only a skill's checks. `bundledSkillDirs` answers
// what the pack BUNDLES; the mount (bundledSkillSources) is what additionally
// insists on a SKILL.md before a session can load one.
test('a skills/ subdirectory counts whether or not it carries a SKILL.md', () => {
  const dir = packDir({
    'pack.mjs': 'export default {};\n',
    'skills/loadable/SKILL.md': '# s\n',
    'skills/checks-only/declared-checks.json': '[]\n',
  });
  try {
    assert.deepEqual(bundledSkillDirs(dir), ['checks-only', 'loadable']);
  } finally { removeTree(dir); }
});

test('a declared field overrides the tree, an explicit null included', () => {
  const dir = packDir({
    'pack.mjs': 'export default {};\n',
    'RULES.md': '# rules\n',
    'badge.svg': '<svg/>\n',
    'skills/withheld/SKILL.md': '# s\n',
    'skills/kept/SKILL.md': '# s\n',
  });
  try {
    const merged = applyPackConventions({ id: 'other', prose: null, skills: ['kept'] }, dir, 'demo');
    assert.equal(merged.id, 'other');
    assert.equal(merged.prose, null);
    assert.deepEqual(merged.skills, ['kept']);
    // Undeclared still falls through.
    assert.equal(merged.badge, 'badge.svg');
  } finally { removeTree(dir); }
});

test('a non-object export is handed back untouched — the spec is what reports it', () => {
  const dir = packDir({ 'pack.mjs': 'export default {};\n' });
  try {
    for (const bad of [null, undefined, 'nope', [1, 2]]) {
      assert.deepEqual(applyPackConventions(bad, dir, 'demo'), bad);
    }
  } finally { removeTree(dir); }
});

// The end-to-end statement: a manifest that declares none of the four still loads
// with all four filled in, and a local pack gets the same treatment as a canon one.
test('discoverPacks: a manifest declaring none of the four loads with all four', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-conv-local-'));
  const dir = join(root, '.claudinite', 'local', 'packs', 'proj');
  mkdirSync(join(dir, 'skills', 'doit'), { recursive: true });
  writeFileSync(join(dir, 'skills', 'doit', 'SKILL.md'), '# doit\n');
  writeFileSync(join(dir, 'RULES.md'), '# proj\n');
  writeFileSync(join(dir, 'badge.svg'), '<svg/>\n');
  writeFileSync(join(dir, 'pack.mjs'),
    "export default { ruleRoutingGuidance: { belongs: 'whatever proj owns', excludes: 'whatever proj does not' } };\n");
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.deepEqual(errors, []);
    const proj = packs.find((p) => p.id === 'proj');
    assert.ok(proj, 'the pack loaded with the directory name as its id');
    assert.equal(proj.prose, 'RULES.md');
    assert.equal(proj.badge, 'badge.svg');
    assert.deepEqual(proj.skills, ['doit']);
  } finally { removeTree(root); }
});

// A rule module is discovered by the directory it sits in, in filename order — and
// a test beside one is not a rule, whatever the loader would make of importing it.
test('a rule directory yields its modules in filename order, tests excluded', () => {
  const dir = packDir({
    'pack.mjs': 'export default {};\n',
    'worldRules/zebra.mjs': 'export default {};\n',
    'worldRules/alpha.mjs': 'export default {};\n',
    'worldRules/alpha.test.mjs': 'export default {};\n',
    'worldRules/notes.md': '# not a module\n',
    'workRules/only.mjs': 'export default {};\n',
  });
  try {
    assert.deepEqual(ruleModuleFiles(dir, 'worldRules').map((f) => f.split('/').pop()), ['alpha.mjs', 'zebra.mjs']);
    assert.deepEqual(ruleModuleFiles(dir, 'workRules').map((f) => f.split('/').pop()), ['only.mjs']);
    assert.deepEqual(ruleModuleFiles(dir, 'nothingHere'), []);
  } finally { removeTree(dir); }
});

// A rule's scope has always been its placement. The loader stamps it from the
// DIRECTORY now, and the end-to-end statement is that both scopes still arrive
// stamped, from files no manifest names.
test('discoverPacks: a pack\'s rules come from its rule directories, scoped by which one', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-conv-rules-'));
  const dir = join(root, '.claudinite', 'local', 'packs', 'ruled');
  mkdirSync(join(dir, 'worldRules'), { recursive: true });
  mkdirSync(join(dir, 'workRules'), { recursive: true });
  const rule = (id) => `export default { id: '${id}', severity: 'advisory', description: 'd', doc: 'x.md', why: 'w', run: () => [] };\n`;
  writeFileSync(join(dir, 'worldRules', 'audits.mjs'), rule('audits'));
  writeFileSync(join(dir, 'workRules', 'judges.mjs'), rule('judges'));
  writeFileSync(join(dir, 'pack.mjs'),
    "export default { ruleRoutingGuidance: { belongs: 'whatever ruled owns', excludes: 'whatever ruled does not' } };\n");
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.deepEqual(errors, []);
    const ruled = packs.find((p) => p.id === 'ruled');
    assert.deepEqual(ruled.rules.map((r) => [r.id, r.scope]), [['audits', 'world'], ['judges', 'work']]);
  } finally { removeTree(root); }
});

// A module sitting in a rule directory that exports no rule is a file contributing
// nothing, which is the failure the directory-as-declaration makes possible: there
// is no manifest line whose absence would have said so.
test('discoverPacks: a rule directory module that exports no rule is reported', async () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-conv-bad-rule-'));
  const dir = join(root, '.claudinite', 'local', 'packs', 'ruled');
  mkdirSync(join(dir, 'worldRules'), { recursive: true });
  writeFileSync(join(dir, 'worldRules', 'helper.mjs'), 'export const helper = () => 1;\n');
  writeFileSync(join(dir, 'pack.mjs'),
    "export default { ruleRoutingGuidance: { belongs: 'whatever ruled owns', excludes: 'whatever ruled does not' } };\n");
  try {
    const { packs, errors } = await discoverPacks({ localRoot: root });
    assert.equal(errors.length, 1);
    assert.match(errors[0].what, /worldRules\/helper\.mjs sits in a rule directory but default-exports no rule/);
    // Reported, never fatal: the pack still loads, with its other rules intact.
    assert.ok(packs.find((p) => p.id === 'ruled'));
  } finally { removeTree(root); }
});

// The canon is the corpus this convention was derived from: every pack there is
// expected to take all four from its tree rather than restate them. A pack that
// genuinely needs an override states it, and this names which ones do — so the
// next override is a deliberate edit here rather than a quiet drift back.
test('real corpus: no canon pack restates what its directory already says', async () => {
  const { packs } = await discoverPacks();
  assert.ok(packs.length > 0, 'no packs discovered');
  const restated = [];
  for (const pack of packs) {
    const src = readFileSync(join(pack.dir, 'pack.mjs'), 'utf8');
    for (const field of ['id', 'badge', 'prose', 'skills', 'worldRules', 'workRules', 'detect: null', 'marker: null']) {
      const pattern = field.includes(':') ? String.raw`^\s{2}${field},` : String.raw`^\s{2}${field}:`;
      if (new RegExp(pattern, 'm').test(src)) restated.push(`${pack.id}: ${field}`);
    }
  }
  assert.deepEqual(restated, [], 'a pack.mjs must take these from its directory — drop the declaration unless it genuinely overrides it');
});
