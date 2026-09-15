// A PATH MEMBER-OWNED PROSE STILL RUNS — a tolerance, kept for the holders it reaches.
//
// `adopt-pack`'s skill tells an operator to run
// `node .claudinite/shared/packs/claudinite-tasks/converge-workflows.mjs <owner/repo>`, and
// members copied that line into their own `.claudinite/local/packs/**`. #1478 moved the
// module to `src/adopt/` and swept the canon's copies; a converge refreshes
// `.claudinite/shared/` alone, so the copies it could not reach name a path the next
// vendor set does not carry — a BLOCKING `runnable-doc-commands` finding in a repository
// no canon session reads, and an adoption that stops at the step which writes the
// workflows.
//
// @legacy-tolerance advisory:none retire:#2048

import { pathToFileURL } from 'node:url';
import { runConvergeWorkflows } from './src/adopt/converge-workflows.mjs';

export * from './src/adopt/converge-workflows.mjs';
export {
  runConvergeWorkflows, convergeWorkflows, convergeSchedulerWorkflow, convergeExecutorWorkflow,
  declaredSecrets, secretNames, stubsDir, SCHEDULER_WORKFLOW, EXECUTOR_WORKFLOW,
} from './src/adopt/converge-workflows.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The advisory, delivered where a check cannot reach: to the holder, by name, at the
  // moment the old path is used.
  console.error('claudinite-tasks: this command moved to src/adopt/converge-workflows.mjs.'
    + ' Update the prose that names converge-workflows.mjs at the pack root — this path is removed by #2048.');
  runConvergeWorkflows();
}
