// The fleet-pack-seeds work step - the module the runner calls `worker` on
// (cwd = this task dir, bounded by code_work_timeout).
//
// It holds NO sweep logic. The sweep is `check-fleet-pack-seeds.mjs`, its SIBLING in
// this task folder — nothing outside this task uses it, so that is where it lives;
// this worker only invokes it. Same shape as the census's and the freshness sweep's
// workers, deliberately.
//
// Failure is the escalation path. The sweep THROWS when a member could not be read or
// a declaration could not be written (an unusable token, a protected branch, a file
// that changed under the run); this worker turns that into a non-zero exit, and the
// executor treats a non-zero code-work subprocess as a failed task — it converges the
// item to `needs-human` (packs/claudinite-tasks/src/execute/loop.mjs) instead of handing off
// to any agent.

import { main as sweep } from './check-fleet-pack-seeds.mjs';

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let log = console.log;

export async function worker({ repo, log: runLog }) {
  log = runLog;
  // The sweep resolves the HOME repo — the one whose claudinite-fleet-sheepdog pack entry carries
  // `{ owner, exclude, packSeeds }` — from GITHUB_REPOSITORY. Actions sets it and the
  // subprocess inherits it; CLAUDINITE_REPO is the scheduler's own name for the same
  // fact, so fall back to it rather than depending on which of the two happens to be
  // present.
  if (!process.env.GITHUB_REPOSITORY && repo) {
    process.env.GITHUB_REPOSITORY = repo;
  }
  log('converging this fleet\'s seeded pack declarations across its members');
  await sweep();
  log('sweep complete');
}
