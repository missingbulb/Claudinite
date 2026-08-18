import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, deletePath, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import promoteScope from './promote-scope.mjs';

function run(root) {
  return promoteScope.run(buildContext({ root, mode: 'changed' }));
}

test('promote-scope: silent when the branch touches only packs/ and skills/', () => {
  const root = makeRepo({
    changed: {
      'packs/node/RULES.md': '- new rule\n',
      'skills/writing-tests/SKILL.md': 'updated\n',
    },
    commitMsg: 'promote Refs #1',
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('promote-scope: fires on a path outside packs/ and skills/', () => {
  const root = makeRepo({
    changed: {
      'packs/node/RULES.md': '- new rule\n',
      'engine/scheduler/queue/executor.mjs': '// edited\n', // stray: engine machinery, off-limits to promote
    },
    commitMsg: 'promote Refs #1',
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'engine/scheduler/queue/executor.mjs');
    assert.equal(findings[0].rule, 'promote-scope');
  } finally {
    cleanup(root);
  }
});

// Per-user preferences do not live in this repo at all — they belong to a fleet's
// users, so item-routing sends them to the repo the `preferences` setting names. The
// gate is what stops a promote from quietly re-creating a canon-side home for them.
test('promote-scope: a canon-side per-user preferences path is out of bounds', () => {
  const root = makeRepo({
    changed: { 'preferences/someone@example.com.md': '- pref\n' },
    commitMsg: 'promote Refs #1',
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'preferences/someone@example.com.md');
  } finally {
    cleanup(root);
  }
});

test('promote-scope: a deletion outside packs/ and skills/ is caught too', () => {
  const root = makeRepo({
    base: { 'engine/old.md': 'legacy\n' },
    changed: { 'packs/node/RULES.md': '- new rule\n' },
    commitMsg: 'promote Refs #1',
  });
  try {
    deletePath(root, 'engine/old.md', 'prune Refs #1');
    const findings = run(root);
    assert.ok(findings.some((f) => f.file === 'engine/old.md'));
  } finally {
    cleanup(root);
  }
});
