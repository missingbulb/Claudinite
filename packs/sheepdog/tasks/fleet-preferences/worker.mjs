// The fleet-preferences preprocessing entry point — the script the scheduler runs as
// `node worker.mjs` (cwd = this task dir, bounded by agent_preprocessing_timeout).
//
// It holds NO sweep logic. The sweep is `check-fleet-preferences.mjs`, its SIBLING in
// this task folder — nothing outside this task uses it, so that is where it lives;
// this worker only invokes it. Same shape as the census's and the freshness sweep's
// workers, deliberately.
//
// Failure is the escalation path. The sweep THROWS when a member could not be read or
// its pointer could not be written (an unusable token, a protected branch, a file that
// changed under the run); this worker turns that into a non-zero exit, and the
// scheduler treats a non-zero preprocessing subprocess as a failed task — it converges
// one open `needs-human` issue for the task family (engine/scheduler/run.mjs) instead
// of handing off to any agent.

import { pathToFileURL } from 'node:url';
import { main as sweep } from './check-fleet-preferences.mjs';

const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-preferences${slotId ? ` [${slotId}]` : ''}: ${s}`);

export async function main() {
  // The sweep resolves the HOME repo — the one whose sheepdog pack entry carries
  // `{ owner, exclude, preferencesRepo }`, and the default preferences home itself —
  // from GITHUB_REPOSITORY. Actions sets it and the subprocess inherits it;
  // CLAUDINITE_REPO is the scheduler's own name for the same fact, so fall back to it
  // rather than depending on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  log('telling every member where this fleet keeps its users\' preferences');
  await sweep();
  log('sweep complete');
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-preferences failed: ${e.message}`); process.exit(1); });
}
