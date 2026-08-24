import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../claudinite-tasks/shared-code/task-contract.mjs';
import decl from '../../../tasks/adopt-requested-packs/task.mjs';

// The MEMBER half of the fleet fan-out (#749, folded onto the request mode in
// #1119): the enforcer places an `add-packs` work-list issue here and MARKS it, so
// this repo's own scheduler run adopts it and the issue becomes the work item; this
// task's agent then adopts with the repo checked out. Everything asserted here is a
// property whose drift would either let the task fire on its own (nagging every
// member on a cadence) or move the adoption back outside the member's own guards.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packs/claudinite-lifecycle/tasks/adopt-requested-packs');
const briefSrc = readFileSync(join(taskDir, 'task.md'), 'utf8');

test('adopt-requested-packs: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('adopt-requested-packs: manual, sonnet, ceilinged at open-pr', () => {
  assert.equal(decl.id, 'adopt-requested-packs');   // must match its directory name (discover.mjs)
  // `manual`: the work only exists when the fleet places it, and the fleet fires this
  // scheduler in the same breath. A cadence would re-ask a question whose answer
  // arrives by push — and run this task's code-work in every member, every slot.
  assert.equal(decl.frequency, 'manual');
  assert.equal(decl.agent_model, 'sonnet');
  // The ceiling is the guard that matters most: declaring a pack switches on
  // conformance checks in this repo's CI from the moment they land, so a wrong
  // adoption must never auto-merge. verify-outcome.mjs enforces this in code.
  assert.equal(decl.expected_outcome, 'open-pr');
  assert.notEqual(decl.expected_outcome, 'merged-pr');
  assert.deepEqual(decl.precondition_signals, []);
  assert.equal(decl.session_scope, undefined);
});

test('adopt-requested-packs: needs no fleet secret — it reads and edits only its own repo', () => {
  // The whole point of the fan-out: the member side runs on the ordinary Action
  // token and the member's own executor grant. A required fleet secret here would
  // mean the model regressed.
  assert.equal(decl.required_secrets, undefined);
});

test('adopt-requested-packs: its precondition admits its own forced item', () => {
  // Under the slot mechanism this said NO, because a forced run bypassed the
  // precondition and the verdict was consulted by nothing. The queue evaluates it
  // at pick, and a manual task has no anchor to roll to — so a no-go would close
  // the enforcer's own item `outcome:obsolete` without running it.
  const v = decl.precondition();
  assert.equal(v.run, true);
  assert.doesNotMatch(v.reason ?? '', /FORCE_TASKS|CLAUDINITE_OVERRIDES/, 'the slot-era force lever is deleted');
});

test('adopt-requested-packs: one stage — the agent, because the item IS the work list', () => {
  // THE FOLD (#1119). The gate that counted labelled issues is gone with the
  // dispatch that made it necessary: an item exists only because an issue was
  // marked, so "is there work?" is answered by the item's existence. A code-work
  // phase here would be a second answer to a question already settled.
  assert.equal(decl.code_work, undefined);
  assert.equal(decl.code_work_timeout, undefined);
  assert.ok(!existsSync(join(taskDir, 'worker.mjs')));
  assert.notEqual(decl.agent_model, 'none');
  assert.equal(decl.agent_instructions, 'task.md');
  assert.ok(existsSync(join(taskDir, 'task.md')));
  assert.ok(Number.isInteger(decl.agent_execution_timeout) && decl.agent_execution_timeout > 0);
});

test('adopt-requested-packs: the brief routes the HOW to adopt-pack and splits request from suspicion', () => {
  assert.match(briefSrc, /adopt-pack/);
  assert.match(briefSrc, /SKILL\.md/);
  // The two kinds carry different obligations: a request is adopted verbatim, a
  // suspicion is confirmed first — and the brief must draw that line, because the
  // agent has no other place to learn it.
  assert.match(briefSrc, /verbatim/);
  assert.match(briefSrc, /suspects/i);
  assert.match(briefSrc, /not planned/);
});

test('adopt-requested-packs: the brief forbids merging, cross-repo reach, and the queue vocabulary', () => {
  assert.match(briefSrc, /Never merge/);
  assert.match(briefSrc, /Never touch another repo/);
  // The work list is an ordinary issue. A `task:` label on it would be read as
  // queue state by the scheduler run and the executor, which is not what anyone applying it
  // meant.
  assert.match(briefSrc, /Never apply a `task:` label by hand/);
  assert.match(briefSrc, /Never close the issue/);
  assert.doesNotMatch(briefSrc, /ready-for-agent/, 'the slot dispatch labels are gone');
});
