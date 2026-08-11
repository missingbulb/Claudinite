// The fleet-baseline prework entry point — the script the scheduler runs as
// `node worker.mjs` (cwd = this task dir, bounded by prework_timeout) when a
// hand-started run forces this task.
//
// It holds NO dispatch logic. The sweep is `force-fleet-baseline.mjs`, its SIBLING in
// this task folder — nothing outside this task uses it, so that is where it lives;
// this worker only resolves the parameters out of the override bag and invokes it.
// Same shape as the other sheepdog workers, deliberately.
//
// Parameters ride `CLAUDINITE_OVERRIDES` (the scheduler's manual-run override bag,
// which every prework subprocess inherits) and are handed to the sweep as the env
// names it reads — kept as env rather than arguments because the sweep predates this
// task and is still runnable by hand with the same envs.
//
// Failure is the escalation path: the sweep THROWS when a member could not be
// dispatched, this worker turns that into a non-zero exit, and the scheduler
// converges one open `needs-human` issue for the task family.

import { pathToFileURL } from 'node:url';
import { main as sweep } from './force-fleet-baseline.mjs';

const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-baseline${slotId ? ` [${slotId}]` : ''}: ${s}`);

// The override bag, re-parsed here rather than imported from the engine: this worker
// runs as a SUBPROCESS and inherits `CLAUDINITE_OVERRIDES` as text, and a pack
// importing an engine module for four lines of splitting is the coupling packs exist
// to avoid. The shape is the engine's (`A=1,B=2`, newline-separated, bare key ⇒
// `'true'`), asserted against it in this task's tests.
export function parseOverrideBag(raw) {
  const out = {};
  for (const part of String(raw ?? '').split(/[,\n]/)) {
    const token = part.trim();
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq === -1) out[token] = 'true';
    else out[token.slice(0, eq).trim()] = token.slice(eq + 1).trim();
  }
  return out;
}

export async function main() {
  // The sweep resolves the HOME repo from GITHUB_REPOSITORY; CLAUDINITE_REPO is the
  // scheduler's own name for the same fact, so fall back rather than depending on
  // which of the two happens to be present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }

  const overrides = parseOverrideBag(process.env.CLAUDINITE_OVERRIDES);
  if (overrides.REPOS !== undefined) process.env.FLEET_BASELINE_REPOS = overrides.REPOS;
  if (overrides.DRY_RUN !== undefined) process.env.FLEET_BASELINE_DRY_RUN = overrides.DRY_RUN;
  if (overrides.INCLUDE_DORMANT !== undefined) process.env.FLEET_BASELINE_INCLUDE_DORMANT = overrides.INCLUDE_DORMANT;

  log(`forcing baselining across the fleet${overrides.REPOS ? ` (repos: ${overrides.REPOS})` : ''}${overrides.DRY_RUN === 'true' ? ' [dry run]' : ''}`);
  await sweep();
  log('dispatch complete — each member baselines itself and reports in its own repo');
}

// Run only when invoked directly (the scheduler's `node worker.mjs`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-baseline failed: ${e.message}`); process.exit(1); });
}
