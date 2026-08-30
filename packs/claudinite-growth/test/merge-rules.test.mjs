// The growth tasks' auto-merge policies against the rules this pack declares in
// merge-rules.json — asserted through the same engine the landing lane and the
// automerge-policy-scope gate apply, so the declarations are proven to authorize
// exactly the write surface each task's worker doc bounds it to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { declaredMergeRules, policyVerdict } from '../../claudinite-tasks/shared-code/merge-policy.mjs';
import dedup from '../tasks/growth-dedup/task.mjs';
import extract from '../tasks/growth-extract/task.mjs';

const packDir = dirname(dirname(fileURLToPath(import.meta.url)));
const load = () => declaredMergeRules(
  [{ id: 'claudinite-growth', dir: packDir }],
  { packs: ['claudinite-growth'] },
);

test('the pack\'s merge-rules.json compiles cleanly', () => {
  const { rules, errors } = load();
  assert.deepEqual(errors, []);
  assert.ok(rules.has('local-pack-changes'));
  assert.ok(rules.has('local-pack-doc-removals'));
});

test('growth-extract may land additive local-pack edits and nothing else', () => {
  const { rules } = load();
  const verdict = (entries) => policyVerdict({ policy: extract.may_automerge, entries, declaredRules: rules });

  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n', after: '- a\n- b\n' },
    { file: '.claudinite/local/packs/claudinite/declared-checks.json', before: null, after: '[]\n' },
  ]).mergeable, true);

  // A lesson landed outside the local packs is not this task's write surface.
  assert.equal(verdict([
    { file: 'packs/basics/RULES.md', before: '- a\n', after: '- a\n- b\n' },
  ]).mergeable, false);
  // …and a local-pack DELETION is dedup's business, not extract's.
  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n', after: null },
  ]).mergeable, false);
});

test('growth-dedup may land only local-pack Markdown line removals', () => {
  const { rules } = load();
  const verdict = (entries) => policyVerdict({ policy: dedup.may_automerge, entries, declaredRules: rules });

  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n- b\n- c\n', after: '- a\n- c\n' },
  ]).mergeable, true);

  // A prune that also GREW an entry is outside the policy — exactly the dedup
  // rule "never grow an entry", now measured rather than requested.
  assert.equal(verdict([
    { file: '.claudinite/local/packs/claudinite/RULES.md', before: '- a\n- b\n', after: '- a\n- b (but wider)\n' },
  ]).mergeable, false);
});

test('no growth policy can cover the pack\'s own merge rules or task declarations', () => {
  const { rules } = load();
  for (const policy of [extract.may_automerge, dedup.may_automerge]) {
    assert.equal(policyVerdict({
      policy, declaredRules: rules,
      entries: [{ file: '.claudinite/local/packs/x/merge-rules.json', before: null, after: '[]\n' }],
    }).mergeable, false);
    assert.equal(policyVerdict({
      policy, declaredRules: rules,
      entries: [{ file: '.claudinite/local/packs/x/tasks/t/task.mjs', before: 'a\n', after: 'b\n' }],
    }).mergeable, false);
  }
});
