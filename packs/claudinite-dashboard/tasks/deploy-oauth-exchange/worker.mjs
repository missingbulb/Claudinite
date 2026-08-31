// The deploy-oauth-exchange code-work entry point — the script the executor runs as
// `node worker.mjs` (cwd = this task dir, bounded by code_work_timeout).
//
// It holds no deployment logic. That is `deploy.mjs`, its sibling, which is also the
// hand-runnable script an operator uses outside the queue; this only invokes it and
// turns a throw into the exit code the executor reads.

import { pathToFileURL } from 'node:url';
import { main as runDeploy, NeedsAction } from './deploy.mjs';

const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`deploy-oauth-exchange${item ? ` [#${item}]` : ''}: ${s}`);

export async function main() {
  await runDeploy({ log });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    // The kind routes the human-facing instruction on the parked item: a missing
    // secret or an unregistered app is a setting somebody changes, and a
    // deploy that broke is a trace somebody reads.
    console.error(e instanceof NeedsAction
      ? `claudinite-needs-human: action — ${e.message}`
      : `deploy-oauth-exchange failed: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
