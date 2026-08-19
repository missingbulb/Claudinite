// The fleet-baseline code-work entry point — the script the executor runs as
// `node worker.mjs` (cwd = this task dir, bounded by code_work_timeout) when a
// hand-created work item for this task is picked.
//
// It holds NO dispatch logic. The sweep is `force-fleet-baseline.mjs`, its SIBLING in
// this task folder — nothing outside this task uses it, so that is where it lives;
// this worker only resolves the parameters out of the item's Context and invokes it.
// Same shape as the other sheepdog workers, deliberately.
//
// Parameters ride the item's Context (`CLAUDINITE_CONTEXT`, param-bag.mjs) and are
// handed to the sweep as the env names it reads — kept as env rather than arguments
// because the sweep predates this task and is still runnable by hand with the same
// envs.
//
// Failure is the escalation path: the sweep THROWS when a member could not be
// dispatched, this worker turns that into a non-zero exit, and the executor
// converges the item to `needs-human`.

import { pathToFileURL } from 'node:url';
import { fleetWorkerFailed } from '../../fleet-api.mjs';
import { main as sweep } from './force-fleet-baseline.mjs';
import { parseParamBag, contextText } from '../../param-bag.mjs';

const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`fleet-baseline${item ? ` [#${item}]` : ''}: ${s}`);

export async function main() {
  // The sweep resolves the HOME repo from GITHUB_REPOSITORY; CLAUDINITE_REPO is the
  // scheduler's own name for the same fact, so fall back rather than depending on
  // which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }

  const params = parseParamBag(contextText());
  if (params.REPOS !== undefined) process.env.FLEET_BASELINE_REPOS = params.REPOS;
  if (params.DRY_RUN !== undefined) process.env.FLEET_BASELINE_DRY_RUN = params.DRY_RUN;
  if (params.INCLUDE_DORMANT !== undefined) process.env.FLEET_BASELINE_INCLUDE_DORMANT = params.INCLUDE_DORMANT;

  log(`baselining across the fleet${params.REPOS ? ` (repos: ${params.REPOS})` : ''}${params.DRY_RUN === 'true' ? ' [dry run]' : ''}`);
  await sweep();
  log('dispatch complete — each member baselines itself and reports in its own repo');
}

// Run only when invoked directly (code-work's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fleetWorkerFailed('fleet-baseline', e));
}
