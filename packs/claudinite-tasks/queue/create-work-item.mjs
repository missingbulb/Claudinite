// A PATH MEMBER-OWNED PROSE STILL RUNS — a tolerance, not this folder's ABI.
//
// The modules beside this one are frozen because a member's `.github/workflows/` and its
// routines' stored prompts name them, and neither is a file this repository can push to.
// This one is here for a softer reason that binds just as hard: members copied
// `node .claudinite/shared/packs/claudinite-tasks/queue/create-work-item.mjs` out of the
// canon's own docs into their `.claudinite/local/packs/**`, and a converge refreshes
// `.claudinite/shared/` alone. #1478 moved the module to `src/schedule/` and swept the
// canon's copies; the copies it could not reach went on naming a path the next vendor set
// no longer carried, which is a BLOCKING `runnable-doc-commands` finding in a repository
// no canon session reads.
//
// So it retires, where the six never do: the prose holding it open is markdown a member
// can edit, and the notice below is what tells them to.
//
// @legacy-tolerance advisory:none retire:#2048

import { pathToFileURL } from 'node:url';
import { runCreateWorkItem } from '../src/schedule/create-work-item.mjs';

export * from '../src/schedule/create-work-item.mjs';
export {
  runCreateWorkItem, createWorkItem, wakeItem, parseArgs, FORCED_CONTEXT,
} from '../src/schedule/create-work-item.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The advisory, delivered where a check cannot reach: to the holder, by name, at the
  // moment the old path is used. stderr so it cannot be mistaken for the command's own
  // output by anything reading stdout.
  console.error('claudinite-tasks: this command moved to src/schedule/create-work-item.mjs.'
    + ' Update the prose that names queue/create-work-item.mjs — this path is removed by #2048.');
  runCreateWorkItem().catch((e) => { console.error(e); process.exit(1); });
}
