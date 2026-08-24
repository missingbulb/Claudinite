// Skew entry shim (#1317) over the already-retired `tick.mjs` name (#877): both
// renames land here — a member workflow still naming this path starts the
// scheduler run at its new home. Deleted when no member names it (#1324).
import { runSchedulerRun } from '../../../packs/claudinite-tasks/queue/scheduler-run.mjs';

console.log('- invoked as `tick.mjs`, which is the old name for the scheduler run —'
  + ' this repo\'s scheduler workflow is behind the mount and should be re-converged');
runSchedulerRun().catch((e) => { console.error(e); process.exit(1); });
