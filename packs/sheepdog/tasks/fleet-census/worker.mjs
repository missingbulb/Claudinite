// The fleet-census preprocessing entry point — the script the scheduler runs as
// `node worker.mjs` (cwd = this task dir, bounded by prework_timeout).
//
// It holds NO census logic. The census is `check-fleet-coverage.mjs`, its SIBLING
// in this task folder — nothing outside this task uses it, so that is where it
// lives; this worker only invokes it. It is why the census stayed a plain module
// with an exported `main()` and a CLI guard: still runnable by hand, now also
// callable from here.
//
// Failure is the escalation path. The census THROWS when a repo could not be
// classified ("unknown is not uncovered") or when its config/token is unusable;
// this worker turns that into a non-zero exit, and the scheduler treats a non-zero
// preprocessing subprocess as a failed task — it converges one open `needs-human`
// issue for the task family (engine/scheduler/run.mjs) instead of handing off to
// any agent. That replaces the deleted coverage workflow's `report-failure` job.

import { pathToFileURL } from 'node:url';
import { main as census } from './check-fleet-coverage.mjs';

const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-census${slotId ? ` [${slotId}]` : ''}: ${s}`);

export async function main() {
  // The census resolves the HOME repo — the one whose sheepdog pack entry carries
  // `{ owner, exclude }`, and the one the adoption issues land in — from
  // GITHUB_REPOSITORY. Actions sets it and the subprocess inherits it;
  // CLAUDINITE_REPO is the scheduler's own name for the same fact, so fall back to
  // it rather than depending on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  log('taking the fleet coverage census');
  await census();
  log('census complete');
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-census failed: ${e.message}`); process.exit(1); });
}
