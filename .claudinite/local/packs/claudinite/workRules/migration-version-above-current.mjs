import { basename } from 'node:path';
import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { flowOf } from '../../../../../engine/checks/helpers/active-migrations.mjs';
import { stripComments } from '../../../../../engine/checks/helpers/code-scanning.mjs';
import { VERSION_SOURCE, versionFromLiteral, versionAbove, versionsEqual, isVersion } from '../../../../../engine/version.mjs';
import { declaredVersion as engineVersionIn } from './engine-release-record.mjs';

// A MIGRATION RECORD'S `version` IS A PREDICTION, and nothing here priced it.
//
// `migrationApplies` is `record.version > the repo's installed version`, so a record
// reaches exactly the repos sitting below the number it declares. The number it must
// declare is therefore the one its flow will carry once the change lands - and for a
// PACK that number is cut by the pack-versions workflow AFTER the merge, never by the
// change itself. The author is predicting somebody else's next commit.
//
// Predict too low and the record is dead on arrival: every member already converged
// to that version is at-or-above it, so the record never vendors, never applies, and
// nothing is red at any point. #2300 carried the whole hazard by hand - a "Before
// merge" paragraph in its body saying to raise `60924.1` if a bump had cut that number
// first, re-verified in the session two and three-quarter hours later when the owner
// approved. That paragraph is what this rule replaces.
//
// Predicting HIGH is the safe direction and is not a finding: the record simply keeps
// applying until the flow climbs past it.
//
// WHAT IT DOES NOT JUDGE. A change that moves its own flow's version - an engine
// release, which bumps `ENGINE_VERSION` in the same commit - is no longer predicting
// anything, and the number to compare against is the one it is replacing. Out of scope
// rather than guessed at: `engine-release-record` beside this file owns that change.
const RECORD = /^(engine|packs\/[^/]+)\/migrations\/\d{4}-\d{2}-\d{2}-[^/]+\/migration\.mjs$/;
const ENGINE_VERSION_FILE = 'engine/version.mjs';

// The record's `version` field, read the way the ENGINE reads it: a plain literal on
// its own line (`recordVersion` in active-migrations.mjs, which scrapes the source
// because every caller of the predicate is synchronous). A check accepting a looser
// spelling would pass a record the engine cannot price. The two readings are
// drift-guarded by a test running both over every record in the tree.
const VERSION_FIELD = new RegExp(String.raw`^\s*version:\s*'?(${VERSION_SOURCE})'?\s*,\s*$`, 'm');
export function recordDeclaredVersion(text) {
  if (typeof text !== 'string') return null;
  const m = VERSION_FIELD.exec(stripComments(text));
  return m ? versionFromLiteral(m[1]) : null;
}

// A RELOCATED RECORD IS NOT A NEW PREDICTION. Git reports a move as an add, so the
// destination has no base and its long-settled version reads as one this change just
// chose. The id survives a move where the path does not, so the ids the change DELETED
// are what tells the two apart.
const ID_FIELD = /^\s*id:\s*'([^']+)'\s*,\s*$/m;
const declaredId = (text) => (typeof text === 'string' ? ID_FIELD.exec(stripComments(text))?.[1] ?? null : null);

function relocatedIds(work) {
  const ids = new Set();
  for (const file of work.deleted ?? []) {
    if (!RECORD.test(file)) continue;
    const id = declaredId(work.readBase(file));
    if (id) ids.add(id);
  }
  return ids;
}

// Where the flow states the version this record predicts past, and what that version
// is. A pack's lives on its manifest, which the registry has already loaded for every
// pack in the tree - declared or not - so there is no second scraper for it here.
function standingVersion(work, of) {
  if (of.flow === 'engine') {
    return { file: ENGINE_VERSION_FILE, held: engineVersionIn(work.read(ENGINE_VERSION_FILE)), whose: 'the engine' };
  }
  const pack = (work.packs ?? []).find((p) => p.dir && basename(p.dir) === of.pack);
  return { file: `packs/${of.pack}/pack.mjs`, held: pack?.version ?? null, whose: `\`${of.pack}\`` };
}

// The records this change gives a version that reaches nobody. Pure over the changed
// file list plus the readers, so the whole decision is testable with no git.
export function underpredictedRecords(work) {
  const changed = work.changedFiles ?? [];
  const moved = relocatedIds(work);
  const out = [];
  for (const file of changed) {
    if (!RECORD.test(file)) continue;
    const head = work.read(file);
    const declared = recordDeclaredVersion(head);
    // No version at all is the date-window fallback, which this rule says nothing
    // about; a version this change did not touch was priced when it landed.
    if (declared === null) continue;
    if (versionsEqual(declared, recordDeclaredVersion(work.readBase(file)))) continue;
    if (moved.has(declaredId(head))) continue;

    const of = flowOf(file);
    const { file: versionFile, held, whose } = standingVersion(work, of);
    if (changed.includes(versionFile)) continue;
    if (!isVersion(held)) continue;
    if (versionAbove(declared, held)) continue;

    out.push({
      file,
      what: `this change declares version ${declared} on a migration record, which is not above ${whose}'s standing version ${held}`,
      fix: `a record applies only while a repo sits BELOW its version, so this one reaches no repo already at ${held}. `
        + `Declare the version the bump landing after this merge will cut - above ${held} - and re-read ${versionFile} `
        + 'before merging, in case another change\'s bump has taken that number in the meantime.',
    });
  }
  return out;
}

const rule = {
  id: 'migration-version-above-current',
  // ADVISORY, and not because the finding is directional - it is a defect. The rule was
  // written by an unattended growth run whose pull request self-merges, so the severity
  // is the one the growth ladder sets for hand-written logic nobody reviewed
  // (claudinite-growth/extracting-lessons.md). Promote it once it has fired for real.
  on_fail: 'advise',
  scope: 'work',
  description: 'A migration record\'s version is above the version its flow currently carries',
  doc: 'engine/migrations/README.md',
  why: 'a pack\'s version is bumped after the change merges, so a record\'s version is a prediction - declared at or below the version standing in the tree it never vendors and never applies, and nothing is red at any point',

  run(work) {
    const under = underpredictedRecords(work);
    if (!under.length) return [];
    const [first] = under;
    return [finding(rule, { file: first.file, line: null, what: first.what, fix: first.fix })];
  },
};

export default rule;
