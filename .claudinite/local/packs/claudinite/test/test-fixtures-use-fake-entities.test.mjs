import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/test-fixtures-use-fake-entities.mjs';

const run = (root) => rule.run(buildContext({ root, mode: 'all' }));

// A shelf the fixtures own, so no case depends on what the real canon carries: a
// canon pack with a task, a skill and a declared check, a second canon pack whose
// task shares the first's name, and a local pack.
const SHELF = {
  'packs/alpha-pack/pack.mjs': "export default { id: 'alpha-pack' };\n",
  'packs/alpha-pack/tasks/sweep-up/task.json': '{ "id": "sweep-up" }\n',
  'packs/alpha-pack/skills/tidying-up/SKILL.md': '---\nname: tidying-up\n---\nbody\n',
  'packs/alpha-pack/declared-checks.json': '[{ "id": "no-shouting-here", "severity": "advisory" }]\n',
  'packs/alpha-pack/worldRules/coded-rule.mjs': 'export default {};\n',
  'packs/beta-pack/pack.mjs': "export default { id: 'beta-pack' };\n",
  'packs/beta-pack/tasks/sweep-up/task.json': '{ "id": "sweep-up" }\n',
  '.claudinite/local/packs/my-pack/pack.mjs': 'export default {};\n',
};

const at = (path, source, extra = {}) => {
  const root = makeRepo({ base: { ...SHELF, [path]: source, ...extra } });
  try { return run(root); } finally { cleanup(root); }
};

test('a foreign pack, task, skill or check spelled into a fixture is a finding, one per line', () => {
  const findings = at('engine-tests/x.test.mjs', [
    "const a = 'alpha-pack';",
    "const b = { packs: ['local/my-pack'] };",
    "const c = 'packs/alpha-pack/tasks/sweep-up/task.json';",
    "const d = ['tidying-up'];",
    "const e = 'no-shouting-here';",
    "const f = 'coded-rule';",
  ].join('\n') + '\n');
  assert.deepEqual(findings.map((f) => f.line), [1, 2, 3, 4, 5, 6]);
  assert.match(findings[0].what, /the real pack `alpha-pack`/);
  assert.match(findings[3].what, /the real skill `tidying-up`/);
  assert.match(findings[4].what, /the real check `no-shouting-here`/);
  // The remedy names the fake to reach for and the marker for the other answer.
  assert.match(findings[0].fix, /acme-pack/);
  assert.match(findings[0].fix, /@real-entity/);
});

test('a pack\'s own test may name everything that pack owns, with no marker', () => {
  assert.deepEqual(at('packs/alpha-pack/test/own.test.mjs', [
    "const a = 'alpha-pack';",
    "const b = 'packs/alpha-pack/tasks/sweep-up/task.json';",
    "const c = 'tidying-up';",
    "const d = 'no-shouting-here';",
  ].join('\n') + '\n'), []);
});

// Two packs shipping a task under one name is ordinary — `site-release` is both
// cloudflare-site's and github-pages'. Reading one owner per name made the other
// pack's own test look like a foreign reference.
test('a name two packs own is self-reference in either of them', () => {
  assert.deepEqual(at('packs/beta-pack/test/own.test.mjs', "const a = 'packs/beta-pack/tasks/sweep-up/task.json';\n"), []);
});

test('the marker spares its own line and nothing else', () => {
  const findings = at('engine-tests/x.test.mjs',
    "const a = 'alpha-pack'; // @real-entity the pack under test\nconst b = 'alpha-pack';\n");
  assert.deepEqual(findings.map((f) => f.line), [2]);
});

test('an import specifier is a dependency, not a fixture', () => {
  assert.deepEqual(at('engine-tests/x.test.mjs', [
    "import { a } from '../packs/alpha-pack/thing.mjs';",
    "const b = await import('../packs/alpha-pack/other.mjs');",
    'export { a };',
  ].join('\n') + '\n'), []);
});

test('a name only a comment carries is not a fixture', () => {
  assert.deepEqual(at('engine-tests/x.test.mjs', "// alpha-pack's own sweep does this\nconst a = 1;\n"), []);
});

// The collision this rule cannot tell apart, so it declines to guess: a one-word id
// is also ordinary vocabulary — `run('node', …)` spawns a program, `method: 'update'`
// names a GitHub API call. Inside a path there is no doubt, and it fires.
test('a one-word id is matched inside a path and left alone standing alone', () => {
  const shelf = { ...SHELF, 'packs/node/pack.mjs': "export default { id: 'node' };\n" }; // @real-entity the one-word collision this case exists to pin
  const root = makeRepo({ base: { ...shelf, 'engine-tests/x.test.mjs': "const a = 'node';\nconst b = 'packs/node/RULES.md';\n" } }); // @real-entity the one-word collision this case exists to pin
  try {
    assert.deepEqual(run(root).map((f) => f.line), [2]);
  } finally { cleanup(root); }
});

test('the rule says so when it can see no tests at all, rather than passing', () => {
  const root = makeRepo({ base: SHELF });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /selected no test files/);
  } finally { cleanup(root); }
});
