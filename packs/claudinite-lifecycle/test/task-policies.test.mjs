// adopt-requested-packs' auto-merge policy against this pack's declared merge
// rules — an adoption's real diff shape (declaration edit, whole-mount
// re-vendor including the policy files packs carry, regenerated rules index)
// proven mergeable, and anything outside that shape proven parked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { policyVerdict, declaredMergeRules } from '../../claudinite-tasks/shared-code/merge-policy.mjs';
import adoptJson from '../tasks/adopt-requested-packs/task.json' with { type: 'json' };
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const adopt = normalizeTaskDeclaration(adoptJson);

const packDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { rules, errors } = declaredMergeRules(
  [{ id: 'claudinite-lifecycle', dir: packDir }],
  { packs: ['claudinite-lifecycle'] },
);
const verdict = (entries) => policyVerdict({ policy: adopt.automerge, entries, declaredRules: rules });

test('the pack\'s merge-rules.json compiles cleanly', () => {
  assert.deepEqual(errors, []);
});

test('an adoption-shaped diff lands: declaration, re-vendored mount (its policy files included), rules index', () => {
  const v = verdict([
    { file: '.claudinite-settings.json', before: '{"packs":["basics"]}\n', after: '{"packs":["basics","jwt"]}\n' },
    { file: '.claudinite/shared/packs/jwt/pack.mjs', before: null, after: 'export default {};\n' },
    // The vendored tree carries canon-authored policy files — the exact case
    // coversMountPolicySources exists for.
    { file: '.claudinite/shared/packs/basics/tasks/improve-comments/task.json', before: null, after: '{}\n' },
    { file: '.claudinite/shared/packs/claudinite-growth/merge-rules.json', before: '[]\n', after: '[{"name":"x"}]\n' },
    { file: '.claudinite/claudinite-rules.GENERATED.md', before: 'old\n', after: 'new\n' },
  ]);
  assert.equal(v.mergeable, true, v.why);
});

test('what an adoption does not write parks: repo source, workflows, repo-owned policy files', () => {
  assert.equal(verdict([
    { file: 'src/app.mjs', before: 'a\n', after: 'b\n' },
  ]).mergeable, false);
  assert.equal(verdict([
    { file: '.github/workflows/claudinite-scheduler.yml', before: null, after: 'name: x\n' },
  ]).mergeable, false, 'a scaffolded workflow is reviewed — fail-safe, and rare');
  assert.equal(verdict([
    { file: 'packs/p/tasks/t/task.json', before: 'a\n', after: 'b\n' },
  ]).mergeable, false, 'a repo-owned task declaration is never coverable');
});
