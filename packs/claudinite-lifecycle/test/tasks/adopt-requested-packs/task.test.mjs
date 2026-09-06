import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskDeclaration } from '../../../../claudinite-tasks/shared-code/task-contract.mjs';
import declJson from '../../../tasks/adopt-requested-packs/task.json' with { type: 'json' };
import { evaluatePrecondition } from '../../../../claudinite-tasks/shared-code/preconditions.mjs';
import { normalizeTaskDeclaration } from '../../../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const decl = normalizeTaskDeclaration(declJson);

// The MEMBER half of the fleet fan-out (#749, folded onto the request mode in
// #1119): the enforcer places an `add-packs` work-list issue here and MARKS it, so
// this repo's own scheduler run adopts it and the issue becomes the work item; this
// task's agent then adopts with the repo checked out. Everything asserted here is a
// property whose drift would either let the task fire on its own (nagging every
// member on a cadence) or move the adoption back outside the member's own guards.

test('adopt-requested-packs: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('adopt-requested-packs: its precondition admits its own forced item', () => {
  // Under the slot mechanism this said NO, because a forced run bypassed the
  // precondition and the verdict was consulted by nothing. The queue evaluates it
  // at pick, and a manual task has no anchor to roll to — so a no-go would close
  // the enforcer's own item `outcome:obsolete` without running it.
  const v = evaluatePrecondition({ decl }, {});
  assert.equal(v.run, true);
  assert.doesNotMatch(v.reason ?? '', /FORCE_TASKS|CLAUDINITE_OVERRIDES/, 'the slot-era force lever is deleted');
});
