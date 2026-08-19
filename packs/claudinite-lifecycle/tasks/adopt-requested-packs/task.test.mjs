import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../engine/scheduler/task-contract.mjs';
import decl from '../../../../packs/claudinite-lifecycle/tasks/adopt-requested-packs/task.mjs';

// The MEMBER half of the fleet fan-out (#749): the enforcer places an `add-packs`
// work-list issue here and fires this scheduler; this task's agent adopts with the
// repo checked out. Everything asserted here is a property whose drift would either
// let the task fire on its own (nagging every member on a cadence) or move the
// adoption back outside the member's own guards.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../packs/claudinite-lifecycle/tasks/adopt-requested-packs');
const workerSrc = readFileSync(join(taskDir, 'worker.mjs'), 'utf8');
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

test('adopt-requested-packs: two stages — a cheap gate, then the agent, iff work exists', () => {
  assert.equal(decl.code_work, 'node worker.mjs');
  assert.ok(!decl.code_work.includes('..'));
  assert.ok(Number.isInteger(decl.code_work_timeout) && decl.code_work_timeout > 0);
  assert.notEqual(decl.agent_model, 'none');
  assert.equal(decl.agent_instructions, 'task.md');
  assert.ok(existsSync(join(taskDir, 'task.md')));
  assert.ok(Number.isInteger(decl.agent_execution_timeout) && decl.agent_execution_timeout > 0);
  // The conditional handoff: a forced run with an empty work list must end quietly,
  // with no agent phase — a re-fire after the work landed is normal.
  assert.match(workerSrc, /CLAUDINITE_REQUEST_AGENT/);
});

test('adopt-requested-packs: the worker reads only its OWN repo\'s issues', () => {
  assert.match(workerSrc, /GITHUB_REPOSITORY/);
  assert.match(workerSrc, /from '\.\/protocol\.mjs'/);
  assert.ok(!workerSrc.includes('FLEET_GITHUB_TOKEN'));
  assert.ok(!workerSrc.includes('/user/repos'));   // no fleet enumeration — that is the enforcer's
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
  // queue state by the tick and the executor, which is not what anyone applying it
  // meant.
  assert.match(briefSrc, /Never apply a `task:` label/);
  assert.doesNotMatch(briefSrc, /ready-for-agent/, 'the slot dispatch labels are gone');
});
