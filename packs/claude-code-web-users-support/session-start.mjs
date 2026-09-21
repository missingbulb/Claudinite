// This pack's session-start step: say what the pour found.
//
// THE POUR ITSELF IS session-prepare.mjs, which runs in the phase before the skill mount
// and the self-test because what it writes is a pack those steps have to see. By the time
// this step runs, the person's rules are already in the session on the memory channel
// (the rules index imports the poured pack's prose) and their skills are already mounted.
// What is left is the part only a reader needs: whether anything was found, and what it
// cost.
//
// SO IT EMITS NO RULES. Prose on this channel is prose the harness may truncate on the
// way in, with nothing on either side able to tell (#807) - which is exactly why the
// poured pack rides the memory channel instead. A step that also printed the rules would
// be spending the session's context twice for one set of rules.
//
// EVERY MISS IS ONE PLAIN-TEXT NOTE, and the session proceeds on default interaction
// behavior. A missing receipt is its own case: it means the prepare phase never ran,
// which is an engine older than the phase rather than anything about this person.

import { existsSync, readFileSync } from 'node:fs';
import { pour, receiptIn, proseIn } from './pour.mjs';

const note = (s) => { process.stdout.write(`PERSONAL PACK: ${s}\n`); process.exit(0); };

// Strip quotes/backslashes before embedding a value from the store in a message, so an
// unusual one stays tidy in the injected text.
const safe = (s) => String(s).replace(/["\\]/g, '');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const path = receiptIn(root);

// NO RECEIPT MEANS NO PREPARE PHASE - an engine older than the phase, which every member
// holds for the window between the two lanes' deliveries. Pour here instead. It is too late
// for the skill mount and the rules index, which have already read the session's pack set,
// so this branch alone also injects the person's rules the way this step used to: over
// stdout, where they are subject to the truncation the memory channel does not have (#807).
// That is the degraded path, taken only where the good one does not exist yet.
let late = false;
let receipt;
if (existsSync(path)) {
  try {
    receipt = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    note(`the pour left an unreadable receipt (${e.message}) - proceeding with default interaction behavior.`);
  }
} else {
  late = true;
  let config = {};
  try { config = JSON.parse(process.env.CLAUDINITE_PACK_CONFIG || '{}'); } catch { /* the rule reports a malformed config */ }
  try {
    receipt = pour({ root, config, env: process.env });
  } catch (e) {
    note(`this person's pack could not be poured (${e.message}) - proceeding with default interaction behavior.`);
  }
}

const where = safe(receipt.where ?? 'the store');
switch (receipt.outcome) {
  case 'no-store':
    note('this project declares no store for personal packs (the pack entry\'s "config": { "repo": … }) - proceeding with default interaction behavior.');
    break;
  case 'unattended':
    note('the session is unattended (CLAUDE_CODE_SESSION_ATTENDED=0) - a personal pack is for a present person; proceeding with default interaction behavior.');
    break;
  case 'no-identity':
    note('CLAUDE_CODE_USER_EMAIL is not set - proceeding with default interaction behavior.');
    break;
  case 'unusable-identity':
    note(`CLAUDE_CODE_USER_EMAIL (${safe(receipt.identity)}) is not a usable directory name - proceeding with default interaction behavior.`);
    break;
  case 'no-pack':
    note(`${where} holds no pack for this person - proceeding with default interaction behavior.`);
    break;
  case 'nothing-pourable':
    note(`this person's directory in ${where} holds no Markdown, module or JSON file - proceeding with default interaction behavior.`);
    break;
  case 'too-many-files':
    note(`this person's pack in ${where} holds ${receipt.files} files, past the ${receipt.limit} a session pours - proceeding with default interaction behavior.`);
    break;
  case 'too-large':
    note(`this person's pack in ${where} is past the ${receipt.limit} bytes a session pours - proceeding with default interaction behavior.`);
    break;
  case 'unreadable':
    note(`this person's pack could not be read from ${where} (${safe(receipt.why ?? 'no reason given')}) - proceeding with default interaction behavior.`);
    break;
  default:
    break;
}

// What the poured pack costs the session, stated on the engine's facet channel
// (engine/pack_loader/run-pack-session-start.mjs) so the opening summary can say it in
// the unit it states the rest of the load in. This step is the only thing in the session
// that can weigh it: what it weighs lives in another repository.
//
// Words at the standard English ratio, the same estimate the summary line makes of the
// corpus prose - a character count is thrown off by exactly what these files are full of,
// punctuation-dense Markdown. Rounded to 10 where the corpus rounds to 500, because this
// is hundreds of tokens against its tens of thousands.
const tokens = Math.round((receipt.words ?? 0) / 0.75 / 10) * 10;
if (tokens) process.stdout.write(`CLAUDINITE-FACET: ${tokens.toLocaleString('en-US')} personal pack tokens\n`);

// The degraded path's injection: the rules index of an engine this old carries no import
// of the poured prose, so this step is the only thing that can deliver it.
if (late) {
  try {
    const prose = readFileSync(proseIn(root), 'utf8').trim();
    if (prose) process.stdout.write(`${prose}\n`);
  } catch (e) {
    note(`this person's pack was poured but its rules could not be read (${e.message}) - proceeding with default interaction behavior.`);
  }
}

// The one thing the reader cannot see for themselves: their pack came from the file this
// pack no longer addresses, and it stops being read a window from now.
if (receipt.legacy) {
  process.stdout.write(`PERSONAL PACK: this person's rules came from the retired ${safe(receipt.identity)}.md; move them to a ${safe(receipt.identity)}/ directory in ${where}, whose RULES.md they become.\n`);
}
process.exit(0);
