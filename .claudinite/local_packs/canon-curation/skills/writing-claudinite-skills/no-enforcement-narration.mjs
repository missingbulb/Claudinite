import { dirname } from 'node:path';
import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { matchingLines, ruleIdsIn } from '../../../../../engine/checks/helpers/line-scanning.mjs';

// A corpus SKILL.md must not narrate its own enforcement: checks run on their
// own at every Stop and in CI, and each failure message carries its rule — a
// skill that says so anyway duplicates the mechanism and drifts from it.
//
// RELEVANCE FIRST (see engine/checks/README.md "Adding a rule"): a skill check runs on
// EVERY repo, but corpus skills exist only in the canon home — gate on the
// skills registry being tracked, the same gate skill-ownership uses.
const RUNNER = /checks\/run\.mjs/;
const asWord = (id) => new RegExp(`(^|[^\\w-])${id}([^\\w-]|$)`); // never inside a longer kebab name

const rule = {
  id: 'skill-no-enforcement-narration',
  severity: 'blocking',
  description: 'A corpus SKILL.md neither tells the reader to run the checks runner nor names the rules its own checks enforce',
  doc: '.claudinite/local_packs/canon-curation/skills/writing-claudinite-skills/SKILL.md',
  why: 'checks run automatically at every Stop and in CI, and each failure message carries its rule — a skill narrating its own enforcement duplicates the mechanism and drifts from it',

  run(ctx) {
    if (!ctx.tracked.includes('engine/pack_loader/pack-registry.mjs')) return [];
    const docs = ctx.files.filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f));
    return [
      ...matchingLines(ctx, docs, RUNNER).map(({ file, line }) => finding(rule, {
        file, line,
        what: 'tells the reader to run the checks runner',
        fix: 'delete the instruction — the Stop hook and CI run every check on their own',
      })),
      ...docs.flatMap((doc) => [...ruleIdsIn(ctx, dirname(doc))].sort().flatMap((id) =>
        matchingLines(ctx, [doc], asWord(id)).map(({ file, line }) => finding(rule, {
          file, line,
          what: `names its own check rule "${id}"`,
          fix: 'remove the mention — the rule announces itself when it fires, and its failure message carries the instruction',
        })))),
    ];
  },
};

export default rule;
