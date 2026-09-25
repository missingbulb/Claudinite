// This pack's session-prepare step: copy the person's own pack into this repository before
// anything reads the session's pack set.
//
// WHY PREPARE AND NOT START. The skill mount and the self-test read that set before
// session-start.mjs runs. A pack arriving after them is a pack whose skills are not mounted
// and whose absence was never judged, so the copy has to happen in the phase that runs first
// (engine/pack_loader/run-pack-session-start.mjs).
//
// IT SAYS NOTHING HERE. A prepare step's stdout is a diagnostic, not session context; what
// landed is the directory and the address record it wrote, which session-start.mjs reads to
// write the one note a person sees.

import { copyUserPackToRepo } from './copy_user_pack_to_repo.mjs';
import { readGithubLoginThroughProxy } from './read_github_login.mjs';
import { declineReason } from './user_pack_address.mjs';

const config = (() => {
  try { return JSON.parse(process.env.CLAUDINITE_PACK_CONFIG || '{}'); } catch { return {}; }
})();

async function main() {
  // No network read for a session that gets no pack whoever it is.
  const identity = declineReason(config, process.env) === null ? await readGithubLoginThroughProxy(process.env) : {};
  copyUserPackToRepo({ root: process.env.CLAUDE_PROJECT_DIR || process.cwd(), config, env: process.env, identity });
}

main().catch((e) => {
  // The one thing worth logging: the store was named and unreachable. Everything else is in
  // the address record the start step reads.
  process.stderr.write(`could not copy this person's pack: ${e.message}\n`);
}).finally(() => process.exit(0));
