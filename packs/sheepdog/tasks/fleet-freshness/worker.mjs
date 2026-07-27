// The fleet-freshness preprocessing entry point — the script the scheduler runs as
// `node worker.mjs` (cwd = this task dir, bounded by agent_preprocessing_timeout).
//
// It holds NO sweep logic. The sweep is this pack's own
// `check-fleet-freshness.mjs`, two directories up; this worker only invokes it.
// That relative import is the pack importing its OWN file, which pack-independence
// permits — and it is why the sweep stayed a plain module with an exported `main()`
// and a CLI guard: still runnable by hand, now also callable from here. Same shape
// as the census's worker, deliberately.
//
// Failure is the escalation path. The sweep THROWS when a member could not be
// probed ("unknown is not behind") or when its config/token is unusable; this
// worker turns that into a non-zero exit, and the scheduler treats a non-zero
// preprocessing subprocess as a failed task — it converges one open `needs-human`
// issue for the task family (engine/scheduler/run.mjs) instead of handing off to
// any agent.

import { pathToFileURL } from 'node:url';
import { main as sweep } from '../../check-fleet-freshness.mjs';

const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-freshness${slotId ? ` [${slotId}]` : ''}: ${s}`);

export async function main() {
  // The sweep resolves the HOME repo — the one whose sheepdog pack entry carries
  // `{ owner, exclude, canonRepo, staleDays }`, and the one the drift issues land
  // in — from GITHUB_REPOSITORY. Actions sets it and the subprocess inherits it;
  // CLAUDINITE_REPO is the scheduler's own name for the same fact, so fall back to
  // it rather than depending on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  log('sweeping the fleet for members that have fallen behind canon');
  await sweep();
  log('sweep complete');
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-freshness failed: ${e.message}`); process.exit(1); });
}
