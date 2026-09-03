import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import rule from '../worldRules/skills-index-current.mjs';

const SKILL = '---\nname: demo-skill\ndescription: demo\n---\n';
const base = (extra = {}) => ({
  '.claudinite-settings.json': JSON.stringify({ packs: ['basics', 'local/demo'] }),
  '.claudinite/local/packs/demo/pack.mjs': 'export default {};\n',
  '.claudinite/local/packs/demo/skills/demo-skill/SKILL.md': SKILL,
  ...extra,
});

function run(files) {
  const root = makeRepo({ base: files });
  try { return runRule(rule, buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
}

test('skills-index-current: a declared pack holding a skill with no index is flagged', () => {
  const f = run(base());
  assert.equal(f.length, 1);
  assert.match(f[0].what, /skills index is missing/);
  assert.match(f[0].fix, /generate-skills-index\.mjs --write/);
});

test('skills-index-current: an index that does not name a mounted skill is flagged, one that does is silent', () => {
  const stale = run(base({ '.claudinite/claudinite-skills.GENERATED.md': '| `other-skill` | demo | x |\n' }));
  assert.equal(stale.length, 1);
  assert.match(stale[0].what, /"demo-skill" is mounted from a declared pack/);
  assert.deepEqual(run(base({ '.claudinite/claudinite-skills.GENERATED.md': '| `demo-skill` | demo | demo |\n' })), []);
});

test('skills-index-current: a repo holding no skill for its declared packs demands nothing', () => {
  assert.deepEqual(run({ '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) }), []);
});
