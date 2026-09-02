// The entry point the #877 rename left behind (tasks-dispatch DESIGN decision 27).
//
// A member's `.github/workflows/claudinite-scheduler.yml` names the module it runs
// as a literal path, and that file is the one path a converge cannot push — it is
// staged and lands as a pull request somebody merges. So every member spends a
// window running the refreshed mount from the old workflow, and `tick.mjs` going
// missing there is not a broken task: it is that repo's whole queue stopping, with
// no run left to notice or fix it. Nothing in the canon imports the shim, so
// nothing else would fail if it were tidied away.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEDULER_BODIES } from '../workflow-bodies.mjs';

const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (p) => readFileSync(join(CANON, p), 'utf8');

test('the retired `tick.mjs` name still starts a scheduler run', async () => {
  const shim = read('packs/claudinite-tasks/queue/tick.mjs');
  assert.match(shim, /runSchedulerRun/, 'the shim must START the run, not merely re-export it');
  // Importing the module it delegates to is the real assertion: a shim pointing at
  // a module that has moved again would read fine and fail only in production.
  const mod = await import('../../queue/scheduler-run.mjs');
  assert.equal(typeof mod.runSchedulerRun, 'function');
});

test('the shim says which name was used, so a stale workflow is visible in its own log', () => {
  assert.match(read('packs/claudinite-tasks/queue/tick.mjs'), /console\.log\(/);
});

// Both spellings are legal for exactly as long as both are fielded. A check that
// demanded the new one would turn every member's window into a blocking finding on
// a file that member cannot converge.
test('the workflow-shape check accepts either entry point', () => {
  const declared = JSON.parse(read('packs/claudinite-lifecycle/declared-checks.json'));
  const rule = JSON.stringify(declared).match(/queue\\+\/\(([^)]+)\)\\+\.mjs/);
  assert.ok(rule, 'the scheduler-workflow-shape entry-point rule is no longer an alternation');
  assert.deepEqual(rule[1].split('|').sort(), ['scheduler-run', 'tick']);
});

// …and the canon's own two copies name the CURRENT one, so the shim is a
// compatibility path rather than the live wiring.
test('canon runs the current entry point in both its workflow and the stub it ships', () => {
  for (const wf of SCHEDULER_BODIES) {
    assert.match(read(wf), /queue\/scheduler-run\.mjs/, wf);
    assert.doesNotMatch(read(wf), /queue\/tick\.mjs/, wf);
  }
});
