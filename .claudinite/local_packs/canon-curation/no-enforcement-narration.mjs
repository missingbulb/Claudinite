import { join, dirname } from 'node:path';
import { finding } from '../../../engine/checks/lib/findings.mjs';
import { matchingLines, ruleIdsIn } from '../../../engine/checks/lib/lines.mjs';

// A pack's injected prose must not narrate its own enforcement: checks run on
// their own at every Stop and in CI, and each failure message carries its
// rule. Scans exactly the file each pack.mjs declares as `prose`, never the
// pack README — the catalog convention *requires* the README to list the
// pack's rules and how each is enforced. Home-only by declaration:
// canon-curation is declared solely in the canon home repo, which gates this
// rule for free.
const RUNNER = /checks\/run\.mjs/;
const asWord = (id) => new RegExp(`(^|[^\\w-])${id}([^\\w-]|$)`); // never inside a longer kebab name

const rule = {
  id: 'pack-no-enforcement-narration',
  severity: 'blocking',
  description: "A pack's injected prose neither tells the reader to run the checks runner nor names the rules the pack's own checks enforce",
  doc: 'engine/checks/DESIGN.md',
  why: 'checks run automatically at every Stop and in CI, and each failure message carries its rule — prose narrating its own enforcement duplicates the mechanism and drifts from it',

  run(ctx) {
    const docs = ctx.files
      .filter((f) => /^packs\/[^/]+\/pack\.mjs$/.test(f))
      .flatMap((f) => {
        const m = /\bprose:\s*'([^']+)'/.exec(ctx.read(f) ?? '');
        return m ? [join(dirname(f), m[1])] : [];
      });
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
