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

test('skill-usage-declared: each of the four expectations passes on its own', () => {
  for (const expect of ['adoption', 'triggered', 'rare']) {
    assert.deepEqual(whatsOf(fixture('  usage:', `    expect: ${expect}`)), [], expect);
  }
  assert.deepEqual(whatsOf(fixture('  usage:', '    expect: routine', '    loads-per-sessions: 1 in 5')), []);
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
  assert.match(whatsOf(fixture('  usage:', '    expect: routine'))[0], /1 in N/);
  assert.match(whatsOf(fixture('  usage:', '    expect: rare', '    loads-per-sessions: 1 in 5'))[0], /routine/);
  assert.match(whatsOf(fixture('  usage:', '    expect: routine', '    loads-per-sessions: weekly'))[0], /not "1 in N"/);
  assert.match(whatsOf(fixture('  usage: routine'))[0], /block of keys/);
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
