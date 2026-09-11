// WHAT A CONVERGE WROTE THAT A MEMBER'S OWN TESTS COULD SEE (#1932).
//
// The update's deterministic half gates on the vendored `selftest --strict` — a
// run of Claudinite's own probes against the converged mount. It never runs the
// member's test suite, and it cannot: what a repo calls a test is the repo's, not
// the canon's. So the gate says nothing about a cycle that rewrote engine code, a
// config file, or a repo-owned source file through a migration, and such a cycle
// merging green is how a member ends up with red tests nobody attributed to it.
//
// The answer is not a bigger gate but a narrower merge: a cycle whose writes a
// test could see goes to the apply stage, whose session runs those tests and
// repairs what the update broke. A cycle whose writes it could not merges as
// before. This module is that predicate, and everything it excludes is excluded
// because a member's suite is structurally blind to it:
//
//   - a VENDORED PACK TREE is prose, declarations and check code the engine reads
//     through the mount; a repo's own tests neither import it nor assert over it.
//     (The engine tree beside it is the opposite case — it is what runs the
//     checks — so it stays visible.)
//   - the MOUNT'S OWN WIRING — the generated indexes, the CLAUDE.md line that
//     imports one, the mount's merge attributes, the hook settings — is what
//     `convergeWiring` writes, and every one of them is a function of the pack set
//     rather than of the repo. Holding them visible would summon a session for
//     every pack re-vendor, which is the cost this predicate exists to avoid.
//   - a SETTINGS EDIT THAT ONLY MOVED THE STAMP is the converge's bookkeeping, and
//     every cycle writes one. A key a migration ADDED to the same file is a
//     configuration change and is not excluded.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSettingsFile } from '../../../engine/settings-file-names.mjs';
import { LEGACY_STAMP_KEY } from '../../../engine/installed-versions.mjs';
import { CLAUDE_MD, MOUNT_ATTRIBUTES_FILE, SETTINGS_PATH } from '../../../engine/converge-wiring.mjs';
import { RULES_INDEX_FILE } from '../../../engine/pack_loader/generate-rules-index.mjs';
import { SKILLS_INDEX_FILE } from '../../../engine/pack_loader/generate-skills-index.mjs';

const VENDORED_PACKS = '.claudinite/shared/packs/';
// The mount's wiring, taken from the modules that write it rather than respelled:
// a file this set names by a stale path would be reported as a change the repo's
// tests can see on every single cycle.
const MOUNT_WIRING = new Set([RULES_INDEX_FILE, SKILLS_INDEX_FILE, CLAUDE_MD, MOUNT_ATTRIBUTES_FILE, SETTINGS_PATH]);

// Is this path one of the writes a member's own tests are structurally blind to?
export const isConvergeBookkeeping = (file) => file.startsWith(VENDORED_PACKS) || MOUNT_WIRING.has(file);

// The settings object with the installed stamp taken out — what is left is the
// CONFIGURATION, and a change to it is what a member's checks and tests read
// differently. The legacy block goes with it: it holds versions and nothing else.
const withoutStamp = (raw) => {
  const { [LEGACY_STAMP_KEY]: _legacy, engineVersion: _engine, packs, ...rest } = raw;
  return {
    ...rest,
    packs: (Array.isArray(packs) ? packs : []).map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const { version: _version, ...entryRest } = entry;
      return entryRest;
    }),
  };
};

// Did this edit to the settings file move nothing but the installed stamp?
// Anything this cannot compute — a side that is absent or not JSON — is `false`:
// an unanswerable question must not quietly authorize a merge.
export function stampOnlySettingsEdit(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  let a;
  let b;
  try { a = JSON.parse(before); b = JSON.parse(after); } catch { return false; }
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return false;
  return JSON.stringify(withoutStamp(a)) === JSON.stringify(withoutStamp(b));
}

const git = (root, args) => execFileSync('git', ['-C', root, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Every path this cycle wrote into `root`'s working tree that a member's own tests
// could see, sorted. Read from git rather than from the flows' own write logs,
// because the question spans the whole cycle — the engine flow's writes, the pack
// flow's, and every migration's — and the working tree is the one place all three
// have landed by the time this is asked.
//
// A tree git cannot answer for returns nothing rather than throwing: this widens
// when a session is summoned, and a root that is not a checkout is one no update
// worker is running in.
export function changesTestsCouldSee(root) {
  let status;
  // `-z` because a path carrying a space or a quote is rendered quoted in the
  // default format, and a converge writes whatever a migration names.
  // `--no-renames` so a record is one path, never a pair; `-uall` so an untracked
  // DIRECTORY is listed as its files, which is what the prefixes below match on.
  try { status = git(root, ['status', '--porcelain', '-z', '--no-renames', '-uall']); }
  catch { return []; }

  const files = [];
  for (const record of status.split('\0')) {
    if (!record) continue;
    const file = record.slice(3); // "XY " then the path
    if (!file || isConvergeBookkeeping(file)) continue;
    if (isSettingsFile(file)) {
      let head = null;
      try { head = git(root, ['show', `HEAD:${file}`]); } catch { /* added this cycle */ }
      let working = null;
      try { working = readFileSync(join(root, file), 'utf8'); } catch { /* deleted this cycle */ }
      if (stampOnlySettingsEdit(head, working)) continue;
    }
    files.push(file);
  }
  return [...new Set(files)].sort();
}
