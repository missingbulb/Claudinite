// The fleet-baseline work step - the module the runner calls `worker` on (cwd = this
// task dir, bounded by code_work_timeout) when a hand-created work item for this task
// is picked.
//
// It holds NO dispatch logic. The sweep is `force-fleet-baseline.mjs`, its SIBLING in
// this task folder — nothing outside this task uses it, so that is where it lives;
// this worker only resolves the parameters out of the item's Context and invokes it.
// Same shape as the other claudinite-fleet-sheepdog workers, deliberately.
//
// Parameters ride the item's Context (the bag's `context`, param-bag.mjs) and are
// handed to the sweep as the env names it reads — kept as env rather than arguments
// because the sweep predates this task and is still runnable by hand with the same
// envs.
//
// Failure is the escalation path: the sweep THROWS when a member could not be
// dispatched, or when a dispatched member never reached canon's versions (#1293); the
// runner turns that into a non-zero exit and prints the error's own `triage`, and the
// executor converges the item to `needs-human`.

import { main as sweep } from './force-fleet-baseline.mjs';
import { parseParamBag } from '../../param-bag.mjs';

// The item this run belongs to, stamped on every line the task prints. Module-level
// because the helpers below log too, and set once from the bag when the run starts.
let item = '';
const log = (s) => console.log(`fleet-baseline${item ? ` [#${item}]` : ''}: ${s}`);

export async function worker({ item: workItem, repo, context }) {
  item = workItem.number ? String(workItem.number) : '';
  // The sweep resolves the HOME repo from GITHUB_REPOSITORY; the bag's `repo` is the
  // scheduler's own name for the same fact, so fall back rather than depending on
  // which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && repo) {
    process.env.GITHUB_REPOSITORY = repo;
  }

  const bag = parseParamBag(context.join('\n'));
  if (bag.REPOS !== undefined) process.env.FLEET_BASELINE_REPOS = bag.REPOS;
  if (bag.DRY_RUN !== undefined) process.env.FLEET_BASELINE_DRY_RUN = bag.DRY_RUN;
  if (bag.INCLUDE_DORMANT !== undefined) process.env.FLEET_BASELINE_INCLUDE_DORMANT = bag.INCLUDE_DORMANT;
  if (bag.FOLLOW_MINUTES !== undefined) process.env.FLEET_BASELINE_FOLLOW_MINUTES = bag.FOLLOW_MINUTES;

  log(`waking the update task across the fleet${bag.REPOS ? ` (repos: ${bag.REPOS})` : ''}${bag.DRY_RUN === 'true' ? ' [dry run]' : ''}`);
  await sweep();
  log('complete — every dispatched member was followed to canon\'s versions or reported as not there');
}
