// SessionStart step: inject the current user's personal interaction preferences
// into the session context (stdout is forwarded by the session-start orchestrator).
//
// WHERE PREFERENCES LIVE IS A DECLARATION, NOT A CONSTANT. Personal preferences
// belong to one fleet's users — not to this project, and not to the canon, which is
// shared by every fleet and is therefore both the wrong host and the wrong authority
// on the location. So the project's own settings name the home:
//
//   "preferences": { "repo": "owner/fleet-repo", "path": "preferences" }   (path optional)
//
// resolved by the one resolver in the engine (`preferencesLocation`), and read here as
// `<path>/<email>.md`. No home declared ⇒ nothing to inject: a project with no fleet
// behind it has no preferences home, which is an ordinary state and not a fault.
//
// Preferences are PER-USER settings, so a consumer never vendors them
// (vendoring/DESIGN.md): read the local copy when THIS tree carries one (the
// preferences home repo itself, where the file being edited in the working tree is
// the truth), otherwise fetch just this user's file over HTTPS, fresh.
//
// Deliberately FAIL-SOFT on every miss — the load-bearing cargo (packs, checks,
// skills) is already local, and preferences are a nice-to-have: a miss injects a
// one-line note and the session proceeds on defaults, never a halt directive. Plain
// text only, and always exit 0 (a non-zero SessionStart hook makes Claude Code
// discard the whole orchestrator's stdout).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preferencesLocation } from '../../checks/helpers/repo-context.mjs';

const DECLARATION = '.claudinite-checks.json';
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_ATTEMPTS = 3;

const note = (s) => process.stdout.write(`PREFERENCES: ${s}\n`);
const done = (s) => { if (s) process.stdout.write(s.endsWith('\n') ? s : `${s}\n`); process.exit(0); };

// Strip quotes/backslashes before embedding an address in a message, so an unusual
// one stays tidy in the injected text.
const safe = (s) => String(s).replace(/["\\]/g, '');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const email = process.env.CLAUDE_CODE_USER_EMAIL || '';
if (!email) {
  note('CLAUDE_CODE_USER_EMAIL is not set — proceeding with default interaction behavior.');
  process.exit(0);
}
// The address becomes a path and a URL component, so an implausible one is refused
// rather than traversed with: `../../x` as an "email" would read an arbitrary file.
if (!/^[^\s/\\]+@[^\s/\\]+$/.test(email) || email.includes('..')) {
  note(`CLAUDE_CODE_USER_EMAIL (${safe(email)}) is not a usable file name — proceeding with default interaction behavior.`);
  process.exit(0);
}

// The pointer comes from the project's OWN declaration, read raw: this step runs
// before anything else has loaded the config, and it needs one key.
let declared = null;
try {
  declared = JSON.parse(readFileSync(join(root, DECLARATION), 'utf8'));
} catch { /* absent or malformed — the world runner reports it; here it is just no pointer */ }

const home = preferencesLocation(declared);
if (!home) {
  note(`this project declares no preferences home ("preferences" in ${DECLARATION}) — proceeding with default interaction behavior.`);
  process.exit(0);
}

// Local first: the preferences home repo itself carries the directory, and there the
// working tree — not the default branch — is what the owner is reading and editing.
const local = join(root, home.path, `${email}.md`);
if (existsSync(local)) {
  try {
    done(readFileSync(local, 'utf8'));
  } catch (e) {
    note(`${home.path}/${safe(email)}.md is present but unreadable (${e.message}) — proceeding with default interaction behavior.`);
    process.exit(0);
  }
}

// Not this tree's own: fetch the single file. CLAUDINITE_PREFS_URL overrides the
// derived base for a fork or a test. `HEAD` is the home repo's default branch,
// whatever it is called — the pointer names a repo, never a branch.
const base = process.env.CLAUDINITE_PREFS_URL
  || `https://raw.githubusercontent.com/${home.repo}/HEAD/${home.path}`;
const url = `${base}/${encodeURIComponent(email)}.md`;

let lastError = 'no response';
for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404) { lastError = 'no preferences file for this user'; break; } // a definite answer — do not retry it
    if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
    const text = await res.text();
    if (text.trim()) done(text);
    lastError = 'the file is empty';
    break;
  } catch (e) {
    lastError = e.message || String(e);
  }
}
note(`${safe(email)} at ${home.repo} could not be read (${lastError}) — proceeding with default interaction behavior.`);
process.exit(0);
