// The fleet-roster prework entry point — the script the executor runs as prework,
// `node worker.mjs` (cwd = this task dir, bounded by prework_timeout).
//
// It holds NO sweep logic. The sweep is `check-fleet-roster.mjs`, its SIBLING in this
// task folder — nothing outside this task uses it, so that is where it lives; this
// worker only invokes it. It is why the sweep stayed a plain module with an exported
// `main()` and a CLI guard: still runnable by hand, now also callable from here. Same
// shape as the other sheepdog workers, deliberately.
//
// Failure is the escalation path. The sweep THROWS when a repo could not be classified
// ("unknown is neither uncovered nor behind") or when its config/token is unusable;
// this worker turns that into a non-zero exit, and the executor treats a non-zero
// prework subprocess as a failed task — it converges the item to `needs-human`
// (engine/scheduler/queue/executor.mjs) instead of handing off to any agent.

import { pathToFileURL } from 'node:url';
import { main as sweep } from './check-fleet-roster.mjs';

const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`fleet-roster${item ? ` [#${item}]` : ''}: ${s}`);

export async function main() {
  // The sweep resolves the HOME repo — the one whose sheepdog pack entry carries
  // `{ owner, exclude, canonRepo, staleDays }`, and the one both issue families land
  // in — from GITHUB_REPOSITORY. Actions sets it and the subprocess inherits it;
  // CLAUDINITE_REPO is the scheduler's own name for the same fact, so fall back to it
  // rather than depending on which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }
  log('sweeping the fleet roster (coverage + freshness)');
  await sweep();
  log('ok');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-roster failed: ${e.message}`); process.exit(1); });
}
