// The deploy-oauth-exchange work step - the module the runner calls `worker` on
// (cwd = this task dir, bounded by code_work_timeout).
//
// It holds no deployment logic. That is `deploy.mjs`, its sibling, which is also the
// hand-runnable script an operator uses outside the queue; this only invokes it. A
// throw carries its own park routing (`NeedsAction` sets `triage`), which the runner's
// entry point reads.

import { main as runDeploy } from './deploy.mjs';

// The item this run belongs to, stamped on every line the task prints. Module-level
// because the helpers below log too, and set once from the bag when the run starts.
let item = '';
const log = (s) => console.log(`deploy-oauth-exchange${item ? ` [#${item}]` : ''}: ${s}`);

export async function worker(params) {
  item = params.item.number ? String(params.item.number) : '';
  await runDeploy({ log });
}
