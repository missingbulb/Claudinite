// The fleet-fit preprocessing entry point — the script the scheduler runs as
// `node worker.mjs` (cwd = this task dir, bounded by prework_timeout), before the
// agent stage.
//
// It holds NO sweep logic. The sweep is `check-fleet-fit.mjs`, its SIBLING in this
// task folder — nothing outside this task uses it, so that is where it lives; this
// worker only invokes it. Same shape as the census's and the freshness sweep's
// workers, deliberately.
//
// What it hands the agent is the ISSUE SURFACE, not a data channel: the sweep
// converges `fleet-fit` issues in this repo, and the agent stage reads them from
// there under its own instructions (task.md). Nothing this prints reaches the
// dispatch issue — the executor's "no code→agent data channel" model
// (docs/task-prework/DESIGN.md §3) is untouched.
//
// Failure is the escalation path. The sweep THROWS when a member could not be swept
// ("unknown is not fitted") or when its config/token is unusable; this worker turns
// that into a non-zero exit, and the scheduler treats a non-zero preprocessing
// subprocess as a failed task — it converges one open `needs-human` issue for the
// task family (engine/scheduler/run.mjs) and never reaches the agent stage. A sweep
// that could not see the whole fleet must not be followed by an agent acting on a
// partial picture.

import { pathToFileURL } from 'node:url';
import { main as sweep } from './check-fleet-fit.mjs';

const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-fit${slotId ? ` [${slotId}]` : ''}: ${s}`);

export async function main() {
  // The sweep resolves the HOME repo — the one whose sheepdog pack entry carries the
  // fleet config, and the one the fit issues land in — from GITHUB_REPOSITORY.
  // Actions sets it and the subprocess inherits it; CLAUDINITE_REPO is the
  // scheduler's own name for the same fact, so fall back to it rather than depending
  // on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  log('sweeping the fleet for packs a member\'s shape suspects but its declaration does not carry');
  await sweep();
  log('sweep complete');
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-fit failed: ${e.message}`); process.exit(1); });
}
