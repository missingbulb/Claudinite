// This pack's session-start step: say whose pack was copied and from where, or why there is none.
//
// THE COPY ITSELF IS session-prepare.mjs, which runs in the phase before the skill mount and
// the self-test, because what it writes is a pack those steps have to see. By the time this
// step runs, the person's rules are already in the session on the memory channel (the rules
// index imports the copied pack's prose) and their skills are already mounted. What is left
// is the part only a reader needs: which identity was used, and which directory.
//
// SO IT EMITS NO RULES. Prose on this channel is prose the harness may truncate on the way in,
// with nothing on either side able to tell (#807), which is exactly why the pack rides the
// memory channel instead. A step that also printed the rules would spend the session's context
// twice for one set of them.
//
// IT READS the prose the copy left (the placeholder means nothing landed), the reasons that are
// a pure function of the config and the environment, and the address record for the rest: the
// login came off the network, and this step does not read it a second time.

import { existsSync, readFileSync } from 'node:fs';
import { PLACEHOLDER, proseIn, addressRecordIn } from './copy_user_pack_to_repo.mjs';
import { resolveStore, declineReason, candidateDirs } from './user_pack_address.mjs';

const say = (s) => { process.stdout.write(`PERSONAL PACK: ${s}\n`); process.exit(0); };
const decline = (s) => say(`${s} - proceeding with default interaction behavior.`);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const config = (() => {
  try { return JSON.parse(process.env.CLAUDINITE_PACK_CONFIG || '{}'); } catch { return {}; }
})();

const prose = existsSync(proseIn(root)) ? readFileSync(proseIn(root), 'utf8') : null;

// No file at all means the prepare phase never ran: an engine older than the phase, which a
// member holds until the engine lane catches up with the pack lane. Nothing to report about
// this person, and nothing this step can do about it from here.
if (prose === null) {
  decline('this repo\'s engine has no session-prepare phase, so no personal pack was copied in');
}

const declined = declineReason(config, process.env);
if (declined) decline(declined);

const record = (() => {
  try { return JSON.parse(readFileSync(addressRecordIn(root), 'utf8')); } catch { return null; }
})();
const store = resolveStore(config);
const dirs = (list) => list.map((d) => `${d}/`).join(' or ');
const who = !record
  ? 'this person'
  : record.login
    ? `GitHub user ${record.login}`
    : `no GitHub login (${record.loginError}), so by CLAUDE_CODE_USER_EMAIL ${record.email || '(not set)'}`;

if (prose === PLACEHOLDER || !record?.used) {
  if (record && !record.tried.length) {
    decline(`${who}, which is not a usable directory name for CLAUDE_CODE_USER_EMAIL either`);
  }
  decline(record
    ? `copied nothing for ${who}: ${store.repo} holds no pack at ${dirs(record.tried)}, or it could not be read`
    : `${store.repo} holds no pack for this person, or it could not be read`);
}

const copied = `copied ${record.used}/ from ${store.repo} for ${who}`;
if (record.form === 'email') {
  // The advisory that reaches the person, beside the store-file-names one that reaches the store.
  const target = record.login ? candidateDirs(store, { login: record.login, email: '' })[0].dir : `${store.path}/<login>`;
  say(`${copied}, through the email fallback: move it to ${target}/ (the GitHub login, lower case), since email directories stop being read once the fallback is removed.`);
}
say(`${copied}.`);
