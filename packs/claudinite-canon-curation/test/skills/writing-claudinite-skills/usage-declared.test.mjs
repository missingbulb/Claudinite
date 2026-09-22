import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import usageDeclared from '../../../skills/writing-claudinite-skills/usage-declared.mjs';

const run = (root) => usageDeclared.run(buildContext({ root, mode: 'all' }));

// The real layout — a skill lives inside its owning pack.
const SKILL = 'packs/demo/skills/demo/SKILL.md';
const doc = (...metadata) => ['---', 'name: demo', 'description: does the thing.', 'metadata:',
  '  body: workflow', ...metadata, '---', '', 'Do the activity well.', ''].join('\n');

const whatsOf = (root) => { try { return run(root).map((f) => f.what); } finally { cleanup(root); } };
const fixture = (...metadata) => makeRepo({ changed: { [SKILL]: doc(...metadata) } });

test('skill-usage-declared: each expectation passes on a skill whose file bears it out', () => {
  for (const expect of ['adoption', 'judgment']) {
    assert.deepEqual(whatsOf(fixture('  usage:', `    expect: ${expect}`)), [], expect);
  }
  assert.deepEqual(whatsOf(fixture('  usage:', '    expect: triggered',
    '  force-load-on-file-edits-paths:', "    - 'wiki/**'")), []);
});

test('skill-usage-declared: "triggered" is refused where the file declares no trigger', () => {
  assert.match(whatsOf(fixture('  usage:', '    expect: triggered'))[0], /no force-load trigger/,
    'the claim is one the skill\'s own file contradicts');
  // The converse is a real claim, not a fault: a skill may carry a trigger and
  // still expect most of its loads to come by judgment.
  assert.deepEqual(whatsOf(fixture('  usage:', '    expect: judgment',
    '  force-load-on-file-edits-paths:', "    - 'wiki/**'")), []);
});

test('skill-usage-declared: a skill that declares nothing is named, with what to add', () => {
  const root = fixture();
  try {
    const found = run(root);
    assert.equal(found.length, 1);
    assert.match(found[0].what, /declares no metadata.usage block/);
    assert.match(found[0].fix, /triggered/, 'the fix names the expectation most skills want');
  } finally { cleanup(root); }
});

test('skill-usage-declared: the mis-declarations are named one by one, not lumped as invalid', () => {
  assert.match(whatsOf(fixture('  usage:', '    expect: sometimes'))[0], /outside/);
  assert.match(whatsOf(fixture('  usage:', '    expect:'))[0], /expect is missing/);
  // A retired key is not silently ignored: the block exists so a reader can tell
  // what a zero means, and a key nothing reads is a claim the record never tests.
  assert.match(whatsOf(fixture('  usage:', '    expect: judgment', '    loads-per-sessions: 1 in 5'))[0],
    /loads-per-sessions is not a key of the usage block/);
  assert.match(whatsOf(fixture('  usage: judgment'))[0], /block of keys/);
});

test('skill-usage-declared: a skill outside a pack\'s skills/ is not its business', () => {
  const root = makeRepo({ changed: {
    '.claude/skills/mounted/SKILL.md': doc(),
    'docs/skills/example/SKILL.md': doc(),
  } });
  try {
    assert.deepEqual(run(root), [], 'a mounted copy and a doc are neither of them a corpus skill');
  } finally { cleanup(root); }
});

test('skill-usage-declared: every skill on this shelf satisfies it', () => {
  // The real tree, not a fixture: the sweep is what proves the check silent where
  // it should be, and a fixture spelling the same gap would only prove its matching.
  const found = usageDeclared.run(buildContext({ root: process.cwd(), mode: 'all' }));
  assert.deepEqual(found.map((f) => `${f.file}: ${f.what}`), []);
});
