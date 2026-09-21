// This pack's session-prepare step: pour the pack belonging to the person in front of this
// session into the session's own pack root, before anything reads that root.
//
// WHY PREPARE AND NOT START. The skill mount and the self-test read the session's pack set
// before session-start.mjs runs. A pack that arrives after them is a pack whose skills are
// not mounted and whose absence was never judged, so the pour has to happen in the phase
// that runs first (engine/pack_loader/run-pack-session-start.mjs).
//
// IT SAYS NOTHING HERE. A prepare step's stdout is a diagnostic, not session context; the
// receipt pour.mjs leaves behind is what session-start.mjs reads to write the one note a
// person sees.

import { pour } from './pour.mjs';

const config = (() => {
  try { return JSON.parse(process.env.CLAUDINITE_PACK_CONFIG || '{}'); } catch { return {}; }
})();

const receipt = pour({
  root: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  config,
  env: process.env,
});
process.stdout.write(`${receipt.outcome}${receipt.where ? ` from ${receipt.where}` : ''}\n`);
process.exit(0);
