// This pack's tasks' auto-merge policies against its declared merge rules — each
// task's real diff shape proven mergeable, and anything outside that shape proven
// parked. adopt-requested-packs' shape is an adoption (declaration edit,
// whole-mount re-vendor including the policy files packs carry, regenerated rules
// index); update's is a converge plus whatever its apply stage delivers on top of
// one — a staged workflow moved into place, and the test repairs that follow the
// suite being re-run (#1932).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { policyVerdict, declaredMergeRules } from '../../claudinite-tasks/shared-code/merge-policy.mjs';
import adoptJson from '../tasks/adopt-requested-packs/task.json' with { type: 'json' };
import updateJson from '../tasks/update/task.json' with { type: 'json' };
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const adopt = normalizeTaskDeclaration(adoptJson);
const update = normalizeTaskDeclaration(updateJson);

const packDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { rules, errors } = declaredMergeRules(
  [{ id: 'claudinite-lifecycle', dir: packDir }],
  { packs: ['claudinite-lifecycle'] },
);
const verdict = (entries) => policyVerdict({ policy: adopt.automerge, entries, declaredRules: rules });
const updateVerdict = (entries) => policyVerdict({ policy: update.automerge, entries, declaredRules: rules });

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

test('an update-shaped diff lands: the converged mount, the stamp, a staged workflow', () => {
  const v = updateVerdict([
    { file: '.claudinite/shared/engine/selftest.mjs', before: 'a\n', after: 'b\n' },
    { file: '.claudinite/shared/packs/basics/RULES.md', before: 'a\n', after: 'b\n' },
    // The mount carries canon-authored policy files — the case coversMountPolicySources exists for.
    { file: '.claudinite/shared/packs/basics/tasks/improve-comments/task.json', before: '{}\n', after: '{"a":1}\n' },
    { file: '.claudinite/pending-workflows/claudinite-executor.yml', before: null, after: 'name: x\n' },
    { file: '.claudinite/claudinite-rules.GENERATED.md', before: 'old\n', after: 'new\n' },
    { file: '.claudinite-settings.json', before: '{"engineVersion":1}\n', after: '{"engineVersion":2}\n' },
  ]);
  assert.equal(v.mergeable, true, v.why);
});

test('what the apply stage adds on top lands too: the delivered workflow, and the test repairs', () => {
  const v = updateVerdict([
    { file: '.github/workflows/claudinite-executor.yml', before: 'name: old\n', after: 'name: new\n' },
    { file: '.claudinite/pending-workflows/claudinite-executor.yml', before: 'name: new\n', after: null },
    { file: 'test/thing.test.mjs', before: 'old expectation\n', after: 'new expectation\n' },
  ]);
  assert.equal(v.mergeable, true, v.why);
});

test('a migration that rewrote the repo\'s own source parks — that is the review this buys', () => {
  assert.equal(updateVerdict([
    { file: 'src/app.mjs', before: 'a\n', after: 'b\n' },
  ]).mergeable, false, 'a repair to production code is a person\'s call, not a nightly\'s');
  assert.equal(updateVerdict([
    { file: '.claudinite/local/packs/mine/tasks/t/task.json', before: 'a\n', after: 'b\n' },
  ]).mergeable, false, 'a repo-owned task declaration is a policy source wherever it sits');
});
