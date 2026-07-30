import { join, dirname } from 'node:path';
import { finding } from '../../../../engine/checks/helpers/findings.mjs';
import { matchingLines, ruleIdsIn } from '../../../../engine/checks/helpers/line-scanning.mjs';

// A pack's injected prose must not narrate its own enforcement: checks run on
// their own at every Stop and in CI, and each failure message carries its
// rule. Scans exactly the file each pack manifest declares as `prose`, never the
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
    // The manifest is JSON since #564, so the prose filename is read rather than
    // pattern-matched out of source text. Scope is the home's own packs/ tree,
    // which this repo has fully converted — a not-yet-migrated `pack.mjs` only
    // ever exists in a CONSUMER's local packs, where this rule does not run.
    const docs = ctx.files
      .filter((f) => /^packs\/[^/]+\/pack\.json$/.test(f))
      .flatMap((f) => {
        const raw = ctx.read(f);
        if (raw === null) return [];
        let manifest;
        try { manifest = JSON.parse(raw); } catch { return []; }
        return typeof manifest?.prose === 'string' ? [join(dirname(f), manifest.prose)] : [];
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
