import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { VERSION_SOURCE, versionFromLiteral, compareVersions, versionsEqual } from '../../../../engine/version.mjs';

// An ENGINE RELEASE is a bump of ENGINE_VERSION, and a bump is only legitimate
// once the live canary rehearsal has passed against the tree being released
// (docs/versioned-updates/DESIGN.md §2.1; owner decision, 2026-08-12). That is a
// claim about a run in another repository, so no check can verify it — but a
// check can insist the claim is MADE, in the one place a later reader will look,
// with the run id that settles it.
//
// Which is the whole job here: a bump must land with its row in
// engine/RELEASES.md, and that row must cite the rehearsal run. Without this the
// evidence lives in whoever ran it, and "was version 4 ever canaried?" becomes
// unanswerable a week later — the version stamped on every member in the fleet,
// with nothing behind it.
//
// WORK SCOPE, like consumer-safe-change beside it: the question is what THIS
// change did, and the tree always contains a version and a log.
//
// It also refuses a bump that does not move forward. Versions are the ordering
// the update flows range over — migrations apply for `installed < target` — so a
// repeated or lowered number does not read as a mistake downstream, it reads as
// "nothing to do" on every member at once.
const VERSION_FILE = 'engine/version.mjs';
export const RELEASES = 'engine/RELEASES.md';

// The run link a row must carry: an Actions run in this repo. Matched by shape
// rather than by repo name — a fork or a rename must not make the rule unsatisfiable.
const RUN_URL = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+/;

// The declared version in a version.mjs source, or null when it says nothing
// (a missing file at the base — the module's first appearance).
const ENGINE_VERSION_RE = new RegExp(String.raw`export const ENGINE_VERSION = '?(${VERSION_SOURCE})'?\s*;`);
export function declaredVersion(text) {
  const m = ENGINE_VERSION_RE.exec(text ?? '');
  return m ? versionFromLiteral(m[1]) : null;
}

// Does the log carry a row for this version citing a rehearsal run? The row is a
// table row whose first cell is the bare version, so the log stays a table a human
// reads rather than a machine format the check invented.
const ROW_VERSION_RE = new RegExp(String.raw`^\|\s*(${VERSION_SOURCE})\s*\|`);
export function releaseRowFor(text, version) {
  for (const line of (text ?? '').split('\n')) {
    const m = ROW_VERSION_RE.exec(line.trim());
    if (m && versionsEqual(versionFromLiteral(m[1]), version)) return RUN_URL.test(line) ? 'ok' : 'no-run';
  }
  return 'missing';
}

const rule = {
  id: 'engine-release-record',
  severity: 'blocking',
  scope: 'work',
  description: 'A bump of ENGINE_VERSION lands with its RELEASES.md row, citing the canary rehearsal that qualified it',
  doc: 'engine/RELEASES.md',
  why: 'the canary runs in another repository, so the run id is the only durable evidence a released version was ever rehearsed — unrecorded, it is unanswerable a week later, on a number every member is stamped with',

  run(work) {
    const changed = work.changedFiles ?? [];
    if (!changed.includes(VERSION_FILE)) return [];
    const head = declaredVersion(work.read(VERSION_FILE));
    const base = declaredVersion(work.readBase(VERSION_FILE));
    if (head === null) return [];                       // not a version edit (or a deletion — other rules own that)
    if (versionsEqual(head, base)) return [];      // the file changed, the version did not: an ordinary engine edit

    if (base !== null && compareVersions(head, base) < 0) {
      return [finding(rule, {
        file: VERSION_FILE,
        what: `ENGINE_VERSION moves backwards, ${base} → ${head}`,
        fix: 'engine versions only ever increase — the update flows read them as an ordering, so a lowered number tells every member it is already up to date',
      })];
    }

    const state = releaseRowFor(work.read(RELEASES), head);
    if (state === 'ok') return [];
    return [finding(rule, {
      file: RELEASES,
      what: state === 'missing'
        ? `this change releases engine version ${head}, and ${RELEASES} carries no row for it`
        : `the ${RELEASES} row for engine version ${head} cites no canary rehearsal run`,
      fix: `dispatch the canary rehearsal against this branch, wait for it to pass, then add a row for version ${head} `
        + 'linking that run — a release is a snapshot the canary has qualified, and the link is what says it was',
    })];
  },
};

export default rule;
