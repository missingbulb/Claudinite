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
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUSPEND_ALL_VAR, suspendedNotice } from '../../queue/suspend.mjs';

const QUEUE = join(dirname(fileURLToPath(import.meta.url)), '../../queue');

// Driven under the operator hold, which is the scheduler run's first act: a run that
// gets that far has been STARTED by the shim, and the hold stops it before it needs a
// token or a repo — so this proves the delegation without a GitHub in the loop.
test('the retired `tick.mjs` name still starts a scheduler run, and says which name was used', () => {
  const r = spawnSync(process.execPath, [join(QUEUE, 'tick.mjs')], {
    encoding: 'utf8', env: { ...process.env, [SUSPEND_ALL_VAR]: 'true', GITHUB_TOKEN: '' },
  });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /tick\.mjs/, 'a stale workflow is visible in its own log');
  assert.ok(r.stdout.includes(suspendedNotice()), 'the scheduler run itself ran, as far as its first act');
});
