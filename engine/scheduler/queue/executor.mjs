// Skew entry shim (#1317): the queue moved to packs/claudinite-tasks/, but a
// member's workflow (or routine prompt) names this path as a literal until the
// fleet repoints — and a re-export alone would not run it, because the entry
// gates on being process.argv[1]. Invoke the moved entry instead, saying which
// name was used so a stale caller is visible in its own log. Deleted when no
// member names this path (#1324).
export * from '../../../packs/claudinite-tasks/queue/executor.mjs';
import { runExecutorMain } from '../../../packs/claudinite-tasks/queue/executor.mjs';
import { pathToFileURL } from 'node:url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('- invoked via the retired engine/scheduler path — this repo\'s workflow or routine is behind the mount and should be repointed (#1317)');
  runExecutorMain().catch((e) => { console.error(e); process.exit(1); });
}
