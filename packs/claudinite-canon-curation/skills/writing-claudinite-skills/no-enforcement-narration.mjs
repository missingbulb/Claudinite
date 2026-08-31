import { dirname } from 'node:path';
import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { matchingLines, ruleIdsIn } from '../../../../engine/checks/helpers/line-scanning.mjs';

// A corpus SKILL.md must not narrate its own enforcement: checks run on their
// own at every Stop and in CI, and each failure message carries its rule — a
// skill that says so anyway duplicates the mechanism and drifts from it.
//
// RELEVANCE FIRST (see engine/checks/README.md "Adding a rule"): a skill check runs
// on every repo that declares the owning pack, but a CORPUS skill lives on a canon's
// shelf — so the scan below is anchored at `packs/<pack>/skills/`, which no repo
// without a shelf has, and needs no separate gate on top of it.
const RUNNER = /checks\/run\.mjs/;
const asWord = (id) => new RegExp(`(^|[^\\w-])${id}([^\\w-]|$)`); // never inside a longer kebab name

// A skill lives inside its owning pack — `<pack>/skills/<name>/SKILL.md`, under
// packs/ on a canon shelf or under .claudinite/local(/packs|_packs)/ for a repo's
// own. The leading `(^|/)` is what spans both roots; anchoring on `packs/` (rather
// than a bare `skills/`) keeps a repo's mounted .claude/skills/ out of the scan.
// This rule scanned a root-level `skills/<name>/` for long enough to matter: no
// tree has carried that shape since, so the check silently matched nothing while
// reading as live.
const SKILL_DOC = /(^|\/)packs\/[^/]+\/skills\/[^/]+\/SKILL\.md$/;

const rule = {
  id: 'skill-no-enforcement-narration',
  severity: 'blocking',
  description: 'A corpus SKILL.md neither tells the reader to run the checks runner nor names the rules its own checks enforce',
  doc: 'packs/claudinite-canon-curation/skills/writing-claudinite-skills/SKILL.md',
  why: 'checks run automatically at every Stop and in CI, and each failure message carries its rule — a skill narrating its own enforcement duplicates the mechanism and drifts from it',

  run(ctx) {
    const docs = ctx.files.filter((f) => SKILL_DOC.test(f));
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
