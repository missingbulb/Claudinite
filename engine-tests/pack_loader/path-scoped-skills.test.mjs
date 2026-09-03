import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { globToRegExp, expandBraces, pathScopedSkills, missingSkillsFor } from '../../engine/pack_loader/path-scoped-skills.mjs';
import { parseFrontmatter, skillMetadata, forceLoadPathsOf } from '../../engine/pack_loader/skill-frontmatter.mjs';
import { skillLoads } from '../../engine/checks/helpers/session-transcript.mjs';
import { removeTree } from '../../engine/remove-tree.mjs';

test('globToRegExp: ** spans directories, * and ? stay inside a segment, braces expand, the rest is literal', () => {
  const tree = globToRegExp('product-wiki/**');
  assert.ok(tree.test('product-wiki/Market/README.md'));
  assert.ok(tree.test('product-wiki/README.md'));
  assert.ok(!tree.test('docs/product-wiki/README.md'));
  const anyDepth = globToRegExp('**/packs/*/RULES.md');
  assert.ok(anyDepth.test('packs/basics/RULES.md'));
  assert.ok(anyDepth.test('.claudinite/local/packs/claudinite/RULES.md'));
  assert.ok(!anyDepth.test('packs/basics/skills/x/RULES.md'), '* does not cross a slash');
  assert.ok(!anyDepth.test('packs/basics/RULESXmd'), 'the dot is literal');
  assert.ok(globToRegExp('src/?.js').test('src/a.js'));
  assert.ok(!globToRegExp('src/?.js').test('src/ab.js'));
  assert.deepEqual(expandBraces('src/**/*.{ts,tsx}'), ['src/**/*.ts', 'src/**/*.tsx']);
  assert.ok(globToRegExp('src/**/*.{ts,tsx}').test('src/a/b.tsx'));
  assert.ok(!globToRegExp('src/**/*.{ts,tsx}').test('src/a/b.js'));
});

test('parseFrontmatter reads the fields the corpus acts on, the forced scope under metadata in every spelling', () => {
  const fm = parseFrontmatter('---\nname: x\ndescription: "Do the, thing"\nmetadata:\n  force-load-on-file-edits-paths:\n    - "wiki/**"\n    - src/*.md\n  other: 1\nallowed-tools: Bash\n---\n# body\n');
  assert.deepEqual(fm, { name: 'x', description: 'Do the, thing', metadata: { 'force-load-on-file-edits-paths': ['wiki/**', 'src/*.md'], other: '1' }, 'allowed-tools': 'Bash' });
  assert.deepEqual(forceLoadPathsOf(fm), ['wiki/**', 'src/*.md']);
  assert.deepEqual(forceLoadPathsOf(parseFrontmatter('---\nmetadata:\n  force-load-on-file-edits-paths: [a/**, "b/*.md"]\n---\n')), ['a/**', 'b/*.md']);
  assert.deepEqual(forceLoadPathsOf(parseFrontmatter('---\npaths:\n  - "wiki/**"\n---\n')), [], 'the harness\'s own paths is not the forced scope');
  assert.deepEqual(parseFrontmatter('# no frontmatter\n'), {});
  assert.deepEqual(parseFrontmatter('---\nname: x\n'), {}, 'an unterminated block is no frontmatter');
});

test('pathScopedSkills reads each active pack\'s bundled skills\' forced scope; missingSkillsFor dedupes by skill', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-scoped-'));
  try {
    const skill = (pack, name, fm) => {
      mkdirSync(join(root, pack, 'skills', name), { recursive: true });
      writeFileSync(join(root, pack, 'skills', name, 'SKILL.md'), fm);
    };
    skill('a', 's1', '---\nname: s1\ndescription: d\nmetadata:\n  force-load-on-file-edits-paths: wiki/**, wiki/*.md\n---\n');
    skill('a', 'plain', '---\nname: plain\ndescription: unscoped\n---\n');
    skill('b', 's2', '---\nname: s2\ndescription: d\nmetadata:\n  force-load-on-file-edits-paths:\n    - wiki/**\n---\n');
    assert.deepEqual(skillMetadata(join(root, 'a', 'skills', 's1')), { name: 's1', description: 'd', forceLoadPaths: ['wiki/**', 'wiki/*.md'] });
    const decls = pathScopedSkills([
      { id: 'a', dir: join(root, 'a'), skills: ['s1', 'plain'] },
      { id: 'b', dir: join(root, 'b'), skills: ['s2'] },
      { id: 'c', dir: join(root, 'c'), skills: [] },
    ]);
    assert.deepEqual(decls.map((d) => [d.pack, d.skill, d.files]), [['a', 's1', 'wiki/**'], ['a', 's1', 'wiki/*.md'], ['b', 's2', 'wiki/**']]);
    assert.deepEqual(missingSkillsFor('wiki/x.md', decls, []).map((d) => d.skill), ['s1', 's2']);
    assert.deepEqual(missingSkillsFor('wiki/x.md', decls, ['s1']).map((d) => d.skill), ['s2']);
    assert.deepEqual(missingSkillsFor('src/x.md', decls, []), []);
  } finally { removeTree(root); }
});

test('skillLoads reads every Skill tool_use on assistant entries, sidechain included, and nothing else', () => {
  const entries = [
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'a' } }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'assistant', isSidechain: true, message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'b' } }] } },
    { type: 'assistant', message: { content: 'plain text' } },
    // Reading a skill's own file is a load too.
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/repo/.claude/skills/c/SKILL.md' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/repo/packs/x/skills/d/README.md' } }] } },
  ];
  assert.deepEqual(skillLoads(entries), ['a', 'b', 'c']);
  assert.deepEqual(skillLoads(null), []);
});
