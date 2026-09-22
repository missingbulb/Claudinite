// The deploy-oauth-exchange work step - the module the runner calls `worker` on
// (cwd = this task dir, bounded by code_work_timeout).
//
// It holds no deployment logic. That is `deploy.mjs`, its sibling, which is also the
// hand-runnable script an operator uses outside the queue; this only invokes it. A
// throw carries its own park routing (`NeedsAction` sets `triage`), which the runner's
// entry point reads.

import { main as runDeploy } from './deploy.mjs';

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let log = console.log;

export async function worker(params) {
  log = params.log;
  await runDeploy({ log });
}
