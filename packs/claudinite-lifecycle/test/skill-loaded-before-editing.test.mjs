import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeRepo, cleanup, makeTranscript } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import rule from '../workRules/skill-loaded-before-editing.mjs';

// Two packs on disk, each bundling one path-scoped skill; only `demo` is declared.
const scopedSkill = (name, paths) => `---\nname: ${name}\ndescription: d\nmetadata:\n  force-load-on-file-edits-paths:\n    - "${paths}"\n---\n`;
const SETTINGS = {
  '.claudinite-settings.json': JSON.stringify({ packs: ['basics', 'demo'] }),
  'packs/demo/skills/writing-wiki-pages/SKILL.md': scopedSkill('writing-wiki-pages', 'product-wiki/**'),
  'packs/other/skills/other-skill/SKILL.md': scopedSkill('other-skill', 'src/**'),
};
const packsIn = (root) => [
  { id: 'demo', dir: join(root, 'packs', 'demo'), skills: ['writing-wiki-pages'] },
  { id: 'other', dir: join(root, 'packs', 'other'), skills: ['other-skill'] },
];

const skillLoad = (skill) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } });
const ownerTurn = { type: 'user', message: { content: 'edit the wiki' } };

function run({ changed, entries }) {
  const root = makeRepo({ base: SETTINGS, changed });
  const t = entries ? makeTranscript(entries) : null;
  try {
    const ctx = buildContext({ root, mode: 'changed', transcriptPath: t?.path ?? null });
    ctx.packs = packsIn(root);
    return runRule(rule, ctx);
  } finally {
    cleanup(root);
    t?.cleanup();
  }
}

test('skill-loaded-before-editing: a scoped file changed with no load of its skill is flagged, naming the skill', () => {
  const findings = run({ changed: { 'product-wiki/Market/README.md': '# Market\n' }, entries: [ownerTurn] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'product-wiki/Market/README.md');
  assert.match(findings[0].what, /product-wiki\/\*\*.*writing-wiki-pages/);
  assert.match(findings[0].fix, /skill: "writing-wiki-pages"/);
});

test('skill-loaded-before-editing: silent once the session loaded the skill — a subagent load counts', () => {
  for (const load of [skillLoad('writing-wiki-pages'), { ...skillLoad('writing-wiki-pages'), isSidechain: true }]) {
    assert.deepEqual(run({ changed: { 'product-wiki/Market/README.md': '# Market\n' }, entries: [ownerTurn, load] }), []);
  }
});

test('skill-loaded-before-editing: a file outside every pattern, and a pattern of an undeclared pack, bind nothing', () => {
  assert.deepEqual(run({ changed: { 'src/app.mjs': '// code\n', 'README.md': '# r\n' }, entries: [ownerTurn] }), []);
});

test('skill-loaded-before-editing: no transcript (CI, a manual run) is silent', () => {
  assert.deepEqual(run({ changed: { 'product-wiki/Market/README.md': '# Market\n' }, entries: null }), []);
});
