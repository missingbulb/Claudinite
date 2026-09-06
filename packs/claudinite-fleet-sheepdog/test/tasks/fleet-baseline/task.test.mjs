import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { validateTaskDeclaration } from '../../../../claudinite-tasks/shared-code/task-contract.mjs';
import declJson from '../../../tasks/fleet-baseline/task.json' with { type: 'json' };
import { evaluatePrecondition } from '../../../../claudinite-tasks/shared-code/preconditions.mjs';
import { isScheduledTask, normalizeTaskDeclaration } from '../../../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const decl = normalizeTaskDeclaration(declJson);

// fleet-baseline as a MANUAL task (#749) — the first task on the non-cadence
// frequency, replacing the pack's standalone workflow (and the `.github/` managed
// copy only the slow agent path could sync). Everything asserted here is a property
// whose drift would let the lever fire on a schedule nobody set, or run past the
// bound the platform kills it at.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-baseline');

test('fleet-baseline: the declaration satisfies the task contract', () => {
  assert.deepEqual(validateTaskDeclaration(decl), []);
});

test('fleet-baseline: the declaration names its own directory and a worker that is there', () => {
  // discover.mjs resolves a task by its directory, and the executor runs code_work from it.
  assert.equal(decl.id, basename(taskDir));
  const [, script] = decl.code_work.split(/\s+/);
  assert.ok(existsSync(join(taskDir, script)), `code_work names ${script}, which is not beside the declaration`);
});

test('fleet-baseline: the scheduler never asks it — only a hand-made item runs it', () => {
  // The declaration states no condition, which is how a task says it has no
  // schedule: the scheduler run's ask skips it, and an item exists only because
  // the enforcer or a person created one.
  assert.equal(isScheduledTask(decl), false);
});

test('fleet-baseline: its precondition admits its own forced item', () => {
  // Under the slot mechanism this said NO, because a forced run bypassed the
  // precondition and the verdict was consulted by nothing. The queue evaluates it
  // at pick, and a manual task has no anchor to roll to — so a no-go would close
  // the operator's own item `outcome:obsolete`, which is how the fleet's converge
  // lever silently stopped working at the flip.
  const v = evaluatePrecondition({ decl }, {});
  assert.equal(v.run, true);
  assert.doesNotMatch(v.reason ?? '', /FORCE_TASKS|CLAUDINITE_OVERRIDES/, 'the slot-era force lever is deleted');
});

// The follow came BACK (#1293), and this is the bound that keeps it safe. What #649
// retired was a blind fixed wait every run paid; what replaced it polls a real
// terminal condition and lets each member leave as it reads current. The danger the
// old rule was guarding against is real, though — code-work runs inside the executor —
// so the follow must give up well inside the bound the platform kills the run at,
// or the report it spent all that time earning is never printed.
test('fleet-baseline: the follow gives up before the platform kills the run', async () => {
  const { DEFAULT_FOLLOW_MINUTES } = await import('../../../tasks/fleet-baseline/force-fleet-baseline.mjs');
  assert.ok(DEFAULT_FOLLOW_MINUTES * 60 < decl.code_work_timeout,
    `a ${DEFAULT_FOLLOW_MINUTES}min follow must finish inside code_work_timeout (${decl.code_work_timeout}s)`);
  // And with real room to spare: the dispatch walk runs before the follow starts, and
  // the final not-started probe runs after it ends.
  assert.ok(decl.code_work_timeout - DEFAULT_FOLLOW_MINUTES * 60 >= 300,
    'leave at least 5 minutes for the dispatch walk and the closing probe');
});
