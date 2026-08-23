import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, deletePath, cleanup, ruleTester } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import rule from '../workRules/shared-tree-immutable.mjs';

ruleTester(rule, {
  clean: {
    'a branch that never touches .claudinite/shared/ is silent': {
      files: { 'packs/node/RULES.md': '- a new rule\n' },
    },
    "the update flow's own commit may rewrite the mount": {
      files: { '.claudinite/shared/engine/checks/run.mjs': '// refreshed\n' },
      commitMsg: 'Claudinite update: engine 60823.1',
    },
  },
  flagged: {
    'a hand-edit under .claudinite/shared/ is caught': {
      files: { '.claudinite/shared/packs/node/RULES.md': '- a hand edit\n' },
      at: [{ file: '.claudinite/shared/packs/node/RULES.md', severity: 'blocking', what: /inside the vendored/ }],
    },
  },
});

test('shared-tree-immutable: a deletion under .claudinite/shared/ is caught too', () => {
  const root = makeRepo({
    base: { '.claudinite/shared/packs/node/RULES.md': '- stale\n' },
    changed: { 'packs/node/RULES.md': '- unrelated change\n' },
  });
  try {
    deletePath(root, '.claudinite/shared/packs/node/RULES.md', 'prune Refs #1');
    const findings = runRule(rule, buildContext({ root, mode: 'all' }));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, '.claudinite/shared/packs/node/RULES.md');
  } finally {
    cleanup(root);
  }
});
