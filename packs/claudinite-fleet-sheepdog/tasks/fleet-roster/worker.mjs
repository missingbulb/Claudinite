// The fleet-roster work step - the module the runner calls `worker` on
// (cwd = this task dir, bounded by code_work_timeout).
//
// It holds NO sweep logic. The sweep is `check-fleet-roster.mjs`, its SIBLING in this
// task folder — nothing outside this task uses it, so that is where it lives; this
// worker only invokes it. It is why the sweep stayed a plain module with an exported
// `main()` and a CLI guard: still runnable by hand, now also callable from here. Same
// shape as the other claudinite-fleet-sheepdog workers, deliberately.
//
// Failure is the escalation path. The sweep THROWS when a repo could not be classified
// ("unknown is neither uncovered nor behind") or when its config/token is unusable;
// this worker turns that into a non-zero exit, and the executor treats a non-zero
// code-work subprocess as a failed task — it converges the item to `needs-human`
// (packs/claudinite-tasks/src/execute/loop.mjs) instead of handing off to any agent.

import { main as sweep } from './check-fleet-roster.mjs';

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let log = console.log;

export async function worker({ repo, log: runLog }) {
  log = runLog;
  // The sweep resolves the HOME repo — the one whose claudinite-fleet-sheepdog pack entry carries
  // `{ owner, exclude, canonRepo }`, and the one both issue families land
  // in — from GITHUB_REPOSITORY. Actions sets it and the subprocess inherits it;
  // the bag's `repo` is the scheduler's own name for the same fact, so fall back to it
  // rather than depending on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && repo) {
    process.env.GITHUB_REPOSITORY = repo;
  }
  log('sweeping the fleet roster (coverage + freshness)');
  await sweep();
  log('ok');
}
