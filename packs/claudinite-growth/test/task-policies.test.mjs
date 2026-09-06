// The growth tasks' auto-merge policies, asserted through the same engine the
// landing lane and the automerge-policy-scope gate apply — each declaration's
// classes (built-in, plus this pack's merge-rules.json) proven to authorize
// exactly the change shape the task's worker doc bounds it to. WHERE a run may
// write is the separate `growth-write-scope` check's business; the policy
// judges only what KIND of change may land unreviewed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { policyVerdict, declaredMergeRules } from '../../claudinite-tasks/shared-code/merge-policy.mjs';
import dedupJson from '../tasks/growth-dedup/task.json' with { type: 'json' };
import extractJson from '../tasks/growth-extract/task.json' with { type: 'json' };
import revalidationJson from '../tasks/rule-revalidation/task.json' with { type: 'json' };
import sweepJson from '../tasks/prose-to-checks-sweep/task.json' with { type: 'json' };
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const dedup = normalizeTaskDeclaration(dedupJson);
const extract = normalizeTaskDeclaration(extractJson);
const revalidation = normalizeTaskDeclaration(revalidationJson);
const sweep = normalizeTaskDeclaration(sweepJson);

const packDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { rules, errors } = declaredMergeRules(
  [{ id: 'claudinite-growth', dir: packDir }],
  { packs: ['claudinite-growth'] },
);
const verdict = (policy, entries) => policyVerdict({ policy, entries, declaredRules: rules });

const RULES_MD = '.claudinite/local/packs/claudinite/RULES.md';

test('the pack\'s merge-rules.json compiles cleanly', () => {
  assert.deepEqual(errors, []);
});

test('growth-extract may land local-pack prose and checks, nothing outside the local packs', () => {
  assert.equal(verdict(extract.automerge, [
    { file: RULES_MD, before: '- a\n', after: '- a\n- b\n' },
    { file: '.claudinite/local/packs/claudinite/declared-checks.json', before: null, after: '[]\n' },
  ]).mergeable, true);

  // A lesson landed outside the local packs is not this task's write surface…
  assert.equal(verdict(extract.automerge, [
    { file: 'packs/basics/RULES.md', before: '- a\n', after: '- a\n- b\n' },
  ]).mergeable, false);
  // …and a local-pack DELETION is dedup's business, not extract's.
  assert.equal(verdict(extract.automerge, [
    { file: RULES_MD, before: '- a\n', after: null },
  ]).mergeable, false);
});

test('rule-revalidation may land local-pack prose rewrites only', () => {
  assert.equal(verdict(revalidation.automerge, [
    { file: RULES_MD, before: '- the old wording\n', after: '- the revalidated wording\n' },
  ]).mergeable, true);
  assert.equal(verdict(revalidation.automerge, [
    { file: 'packs/basics/RULES.md', before: '- a\n', after: '- b\n' },
  ]).mergeable, false, 'canon prose parks for the owner');
});

test('growth-dedup may land Markdown removals and in-line trims, never growth', () => {
  assert.equal(verdict(dedup.automerge, [
    { file: RULES_MD, before: '- a\n- b, stated too widely.\n- c\n', after: '- a\n- b.\n' },
  ]).mergeable, true, 'a removal beside a line cut down');

  // Growing an entry is outside the policy — the dedup rule "never grow an
  // entry", measured rather than requested.
  assert.equal(verdict(dedup.automerge, [
    { file: RULES_MD, before: '- a\n- b\n', after: '- a\n- b (but wider)\n' },
  ]).mergeable, false);

  // …and a trim is only this task's to land inside the local packs: the same
  // edit to the repo's own prose is somebody else's document.
  for (const file of ['README.md', 'CLAUDE.md', 'packs/basics/RULES.md']) {
    assert.equal(verdict(dedup.automerge, [
      { file, before: '- a\n- b\n', after: '- a\n' },
    ]).mergeable, false, file);
  }
});

test('prose-to-checks-sweep may land a local-pack prose deletion beside the check replacing it', () => {
  assert.equal(verdict(sweep.automerge, [
    { file: RULES_MD, before: '- always testable rule\n- other\n', after: '- other\n' },
    { file: '.claudinite/local/packs/claudinite/declared-checks.json', before: '[]\n', after: '[{"id":"x"}]\n' },
  ]).mergeable, true);

  // A conversion that GREW the prose, or wrote outside the local packs, parks.
  assert.equal(verdict(sweep.automerge, [
    { file: RULES_MD, before: '- a\n', after: '- a\n- converted: see check\n' },
  ]).mergeable, false);
  assert.equal(verdict(sweep.automerge, [
    { file: 'packs/basics/declared-checks.json', before: '[]\n', after: '[{"id":"x"}]\n' },
  ]).mergeable, false, 'the canon-home sweep still parks for the owner');
});

test('no growth policy can cover the repo-owned policy sources', () => {
  for (const policy of [extract.automerge, dedup.automerge, revalidation.automerge, sweep.automerge]) {
    assert.equal(verdict(policy, [
      { file: '.claudinite/local/packs/x/merge-rules.json', before: null, after: '[]\n' },
    ]).mergeable, false);
    assert.equal(verdict(policy, [
      { file: '.claudinite/local/packs/x/tasks/t/task.mjs', before: 'a\n', after: 'b\n' },
    ]).mergeable, false);
  }
});
