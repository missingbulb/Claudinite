import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { parseVersion, formatVersion } from '../../../../../engine/version.mjs';
import { VERSIONS_FILENAME, rowVersions } from '../workRules/pack-version-bumped.mjs';

// A PACK VERSION IS AN IDENTITY, NOT A COUNTER. `planPackUpdates` re-fetches a
// pack directory only where `installed < canon`, so the number is the fleet's
// whole name for a set of bytes. Two changes landing under one number means the
// members that converged between the two merges hold the first one's tree
// stamped with a number the second one also claims — and no converge will ever
// correct them, because their stamp already reads as current.
//
// That is not a hypothetical, and it is not an authoring mistake `pack-version-bumped`
// could have caught. Two branches cut from the same main both bump to the same
// next version, both record their row, both go green — each answered "did THIS
// change move the version" correctly and yes — and `pack.mjs` then AUTO-MERGES,
// because the two sides wrote identical bytes. Git has nothing to flag. #1482 is
// what it cost: #1466's janitor rule widening reached no member, the fleet swept
// with the old code, and the members' stamps read exactly as they should.
//
// THE ENGINE HAS NO TWIN OF THIS. `engine-release-record` (the claudinite local
// pack) is `pack-version-bumped`'s sibling, but the engine tree vendors WHOLESALE
// on every converge — its version records what landed, it does not gate what
// ships — so two releases sharing a number strand no content and there is nothing
// here to widen onto `engine/RELEASES.md`.
//
// THE DELIVERY half of that is `pack-delivery-on-main.mjs`, which re-asks
// `pack-version-bumped` against what main held before the push and so catches
// the collision as it lands. This is the RECORD half, and it is not the same
// question: a collision that landed before that gate existed left no red run
// behind, only two rows, and "what did version N change?" has two answers for
// as long as they both stand.
//
// WORLD SCOPE, because two rows claiming one number is a property of the tree,
// not of any diff — neither branch wrote both. `pack-version-bumped` forces a
// row for every bump, so a collision always leaves one.
const rule = {
  id: 'pack-version-claimed-once',
  severity: 'blocking',
  description: "No two rows of a pack's VERSIONS.md claim the same version",
  doc: 'docs/versioned-updates/DESIGN.md',
  why: 'a member re-fetches a pack only when canon\'s version exceeds its installed one, so two changes sharing a number leave whichever members converged between the two merges holding the first tree stamped with the second\'s number — permanently, with nothing red to say so (#1482)',

  run(ctx) {
    const findings = [];
    const logs = ctx.files.filter((f) => f.startsWith('packs/')
      && f.endsWith(`/${VERSIONS_FILENAME}`) && f.split('/').length === 3);
    for (const file of logs) {
      const seen = new Map();
      for (const { version, line } of rowVersions(ctx.read(file))) {
        const parsed = parseVersion(version);
        if (!parsed) continue;                    // not a version at all — the row shape is another rule's question
        const key = formatVersion(parsed);
        if (!seen.has(key)) { seen.set(key, line); continue; }
        findings.push(finding(rule, {
          file,
          line,
          what: `version ${version} is claimed by two rows (also line ${seen.get(key)}), so two changes shipped under one number`,
          fix: `fold the two rows into one saying what version ${version} carries — the members that took it between the two merges `
            + `hold one of them and will never be sent the other — and bump the pack to a fresh version, with its own row, to `
            + `re-deliver the content that was stranded`,
        }));
      }
    }
    return findings;
  },
};

export default rule;
