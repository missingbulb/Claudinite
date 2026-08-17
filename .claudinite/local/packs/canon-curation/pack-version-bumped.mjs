import { finding } from '../../../../engine/checks/helpers/findings.mjs';

// A PACK'S CONTENT IS DELIVERED ON ITS VERSION NUMBER, and on nothing else. The
// engine tree vendors wholesale on every converge; a pack's directory ships only
// where `planPackUpdates` sees `installed.packVersions[id] < pack.version`
// (updates/pack-update.mjs). So a canon commit that edits `packs/<id>/` without
// touching that number lands here, goes green here, and reaches no member — the
// fleet keeps the old bytes while canon believes the change shipped.
//
// #939 is what that costs. A check vocabulary rename updated the engine and the
// canon's own packs in one commit: the engine, delivered unconditionally, reached
// every member and rejected the old spelling; the pack carrying the new spelling
// stayed at `version: 1` and reached nobody. The mixed tree failed each member's
// self-test, the update PR parked, and the fix could not arrive by the route that
// delivers fixes. Seven repos sat frozen for five days.
//
// So the invariant this rule holds is one line: A CHANGE UNDER `packs/<id>/` IS A
// CHANGE TO THAT PACK'S VERSION. Every byte counts, because every byte ships in
// the same directory copy — prose, a skill, a check module, a migration record.
// It is the pack-side twin of `engine-release-record` (the claudinite local pack),
// which holds the same line for `ENGINE_VERSION`.
//
// WORK SCOPE: the question is what THIS change did. The tree always contains a
// version number; only the diff says whether it moved with the content beside it.
const LOCAL_PACKS = '.claudinite/local/packs';

// The pack ids a changed-file list touches, in first-seen order. Anchored at
// `packs/<id>/` so the canon's own local packs (which vendor nowhere, carry no
// version and reach no member) and the tree's own files (`packs/README.md`,
// `packs/directory.GENERATED.md`) are outside it by construction.
export function packsTouched(changed) {
  const ids = [];
  for (const file of changed ?? []) {
    if (file.startsWith(`${LOCAL_PACKS}/`)) continue;
    const m = /^packs\/([^/]+)\//.exec(file);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// The `version:` a pack manifest declares, or null when it declares none (a
// manifest that is absent on one side of the diff, or one the schema check owns).
// The preceding-character class is what keeps `minEngineVersion:` out of it.
export function declaredPackVersion(text) {
  const m = /(?:^|[\s{,])version:\s*(\d+)/m.exec(text ?? '');
  return m ? Number(m[1]) : null;
}

const rule = {
  id: 'pack-version-bumped',
  severity: 'blocking',
  scope: 'work',
  description: 'A change under packs/<id>/ bumps that pack\'s version',
  doc: 'docs/versioned-updates/DESIGN.md',
  why: 'a member receives a pack directory only when the canon\'s version exceeds the one it has installed, so content edited without a bump reaches nobody while canon CI reports it shipped (#939 froze seven repos for five days that way)',

  run(work) {
    const findings = [];
    for (const id of packsTouched(work.changedFiles)) {
      const manifest = `packs/${id}/pack.mjs`;
      const head = declaredPackVersion(work.read(manifest));
      if (head === null) continue;                     // the pack was deleted, or declares no version — other rules own that
      const base = declaredPackVersion(work.readBase(manifest));
      if (base === null) continue;                     // a pack this change introduces: its first version ships to everyone
      if (head > base) continue;

      findings.push(finding(rule, {
        file: manifest,
        what: head === base
          ? `this change edits packs/${id}/ but leaves its version at ${head}`
          : `packs/${id}/ moves its version backwards, ${base} → ${head}`,
        fix: head === base
          ? `raise \`version\` in ${manifest} to ${base + 1} — the number is the whole delivery signal, so an edit that `
            + 'does not move it stays in the canon forever'
          : 'pack versions only ever increase — the update flow reads them as an ordering, so a lowered number tells '
            + 'every member it is already up to date',
      }));
    }
    return findings;
  },
};

export default rule;
