// The growth tasks' auto-merge policies, asserted through the same engine the
// landing lane and the automerge-policy-scope gate apply — proving the built-in
// classes each declaration composes authorize exactly the change shape the
// task's worker doc bounds it to. WHERE a run may write is the separate
// `growth-write-scope` check's business; the policy judges only what KIND of
// change may land unreviewed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policyVerdict } from '../../claudinite-tasks/shared-code/merge-policy.mjs';
import dedup from '../tasks/growth-dedup/task.mjs';
import extract from '../tasks/growth-extract/task.mjs';

test('growth-extract may land added prose and new files, never a deletion or a rewrite of standing code', () => {
  const verdict = (entries) => policyVerdict({ policy: extract.automerge, entries });

  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n', after: '- a\n- b\n' },
    { file: '.claudinite/local/packs/claudinite/declared-checks.json', before: null, after: '[]\n' },
  ]).mergeable, true);

  // A local-pack DELETION is dedup's business, not extract's.
  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n', after: null },
  ]).mergeable, false);
  // …and rewriting an existing code file is nobody's to land unreviewed here.
  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/workRules/x.mjs', before: 'a\n', after: 'b\n' },
  ]).mergeable, false);
});

test('growth-dedup may land only Markdown line removals', () => {
  const verdict = (entries) => policyVerdict({ policy: dedup.automerge, entries });

  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n- b\n- c\n', after: '- a\n- c\n' },
  ]).mergeable, true);

  // A prune that also GREW an entry is outside the policy — exactly the dedup
  // rule "never grow an entry", now measured rather than requested.
  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n- b\n', after: '- a\n- b (but wider)\n' },
  ]).mergeable, false);
});

test('no growth policy can cover a change to the policy sources', () => {
  for (const policy of [extract.automerge, dedup.automerge]) {
    assert.equal(policyVerdict({
      policy,
      entries: [{ file: '.claudinite/local/packs/x/merge-rules.json', before: null, after: '[]\n' }],
    }).mergeable, false);
    assert.equal(policyVerdict({
      policy,
      entries: [{ file: '.claudinite/local/packs/x/tasks/t/task.mjs', before: 'a\n', after: 'b\n' }],
    }).mergeable, false);
  }
});
