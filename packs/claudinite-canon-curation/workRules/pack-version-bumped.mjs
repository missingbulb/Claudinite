import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { LOCAL_PACKS_SUBDIR } from '../../../engine/pack_loader/pack-registry.mjs';
import { VERSION_SOURCE, versionFromLiteral, compareVersions, versionsEqual, nextVersion } from '../../../engine/version.mjs';

// A PACK'S CONTENT IS DELIVERED ON ITS VERSION NUMBER, and on nothing else. The
// engine tree vendors wholesale on every converge; a pack's directory ships only
// where `planPackUpdates` sees `installed.packVersions[id] < pack.version`. So a
// canon commit that edits `packs/<id>/` without touching that number lands on the
// canon, goes green on the canon, and reaches no member — the fleet keeps the old
// bytes while the canon believes the change shipped.
//
// What that costs, from the canon this rule was written in: a check-vocabulary
// rename updated the engine and the canon's own packs in one commit. The engine,
// delivered unconditionally, reached every member and rejected the old spelling;
// the pack carrying the new spelling stayed at its old version and reached nobody.
// The mixed tree failed each member's self-test, the update PR parked, and the fix
// could not arrive by the route that delivers fixes. Seven repos sat frozen for
// five days.
//
// So the invariant this rule holds is one line: A CHANGE UNDER `packs/<id>/` IS A
// CHANGE TO THAT PACK'S VERSION. Every SHIPPING byte counts, because every one of
// them rides the same directory copy — prose, a skill, a check module, a migration
// record. A pack's tests sit beside the files they cover and are the one thing in
// that directory no vendor set carries (compute-vendor-set drops `*.test.mjs`), so
// nobody is waiting on them and a bump for one would re-deliver every pack in the
// tree to say nothing.
//
// WORK SCOPE: the question is what THIS change did. The tree always contains a
// version number; only the diff says whether it moved with the content beside it.

// A repo's OWN packs — neither versioned nor vendored, so nothing about them is
// a delivery question.
const LOCAL_ROOT = `${LOCAL_PACKS_SUBDIR}/`;

// Each pack's version-bump log, next to its manifest — see `versionRecorded`
// below for what it must carry once a bump lands.
export const VERSIONS_FILENAME = 'VERSIONS.md';

// The pack ids a changed-file list touches, in first-seen order. Anchored at
// `packs/<id>/` so the canon's own local packs (which vendor nowhere, carry no
// version and reach no member) and the tree's own files (`packs/README.md`,
// `packs/directory.GENERATED.md`) are outside it by construction. Tests drop out for
// the same reason the local packs do: nothing delivers them. `VERSIONS.md` drops
// out too — it is the log OF bumps, not content a bump ships, so editing it alone
// (recording a bump made elsewhere in the same change, or a wording fix to an old
// row) must never itself demand another bump.
export function packsTouched(changed) {
  const ids = [];
  for (const file of changed ?? []) {
    if (file.startsWith(LOCAL_ROOT) || file.endsWith('.test.mjs') || file.endsWith(`/${VERSIONS_FILENAME}`)) continue;
    const m = /^packs\/([^/]+)\//.exec(file);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// The `version:` a pack manifest declares, or null when it declares none (a
// manifest that is absent on one side of the diff, or one the schema check owns).
// The preceding-character class is what keeps `minEngineVersion:` out of it.
const PACK_VERSION_RE = new RegExp(String.raw`(?:^|[\s{,])version:\s*'?(${VERSION_SOURCE})'?`, 'm');
export function declaredPackVersion(text) {
  const m = PACK_VERSION_RE.exec(text ?? '');
  return m ? versionFromLiteral(m[1]) : null;
}

// A row of the pack's VERSIONS.md is a table row
// whose first cell is the bare version — the same shape `engine/RELEASES.md`
// rows use, so the log reads as a table a human maintains, not a format this
// check invented. No run link is required here (unlike an engine release): a
// pack bump has no canary rehearsal to cite, so the row's own prose is the
// record.
const ROW_VERSION_RE = new RegExp(String.raw`^\|\s*(${VERSION_SOURCE})\s*\|`);

// Every version a log's rows claim, each with the 1-based line it sits on. The
// world-scope `pack-version-claimed-once` reads the same rows to ask whether any
// number is claimed twice, so the shape of a row is defined here once.
export function rowVersions(text) {
  const claims = [];
  (text ?? '').split('\n').forEach((line, i) => {
    const m = ROW_VERSION_RE.exec(line.trim());
    if (m) claims.push({ version: versionFromLiteral(m[1]), line: i + 1 });
  });
  return claims;
}

export function versionRecorded(text, version) {
  return rowVersions(text).some((claim) => versionsEqual(claim.version, version));
}

const rule = {
  id: 'pack-version-bumped',
  severity: 'blocking',
  scope: 'work',
  description: 'A change under packs/<id>/ bumps that pack\'s version, and a bump lands with its VERSIONS.md row',
  doc: 'packs/claudinite-canon-curation/README.md',
  why: 'a member receives a pack directory only when the canon\'s version exceeds the one it has installed, so content edited without a bump reaches nobody while canon CI reports it shipped (#939 froze seven repos for five days that way); an unrecorded bump is the same evidence gap on a smaller scale — "what did version N change?" becomes unanswerable once the commit scrolls out of history',

  run(work) {
    const findings = [];
    for (const id of packsTouched(work.changedFiles)) {
      const manifest = `packs/${id}/pack.mjs`;
      const head = declaredPackVersion(work.read(manifest));
      if (head === null) continue;                     // the pack was deleted, or declares no version — other rules own that
      const base = declaredPackVersion(work.readBase(manifest));
      if (base === null) continue;                     // a pack this change introduces: its first version ships to everyone
      const moved = compareVersions(head, base);

      if (moved <= 0) {
        findings.push(finding(rule, {
          file: manifest,
          what: moved === 0
            ? `this change edits packs/${id}/ but leaves its version at ${head}`
            : `packs/${id}/ moves its version backwards, ${base} → ${head}`,
          fix: moved === 0
            ? `raise \`version\` in ${manifest} to '${nextVersion(base)}' — the version is the whole delivery signal, so an edit `
              + 'that does not move it stays in the canon forever'
            : 'pack versions only ever increase — the update flow reads them as an ordering, so a lowered number tells '
              + 'every member it is already up to date',
        }));
        continue;
      }

      const versionsFile = `packs/${id}/${VERSIONS_FILENAME}`;
      if (!versionRecorded(work.read(versionsFile), head)) {
        findings.push(finding(rule, {
          file: versionsFile,
          what: `packs/${id}/ bumps its version to ${head}, and ${versionsFile} carries no row for it`,
          fix: `add a row to ${versionsFile} for version ${head} saying what changed`,
        }));
      }
    }
    return findings;
  },
};

export default rule;
