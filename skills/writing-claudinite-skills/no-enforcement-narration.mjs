import { dirname, join } from 'node:path';
import { finding } from '../../checks/lib/findings.mjs';

// Checks run automatically — the Stop hook fires at the end of every session
// that changed anything, and CI backstops the rest — so a SKILL.md that tells
// the reader to run the checks runner, or that names/restates the rules its own
// checks enforce, duplicates the mechanism and springs the drift trap the
// conversion existed to close. The rule announces itself when it fires; the
// skill body stays silent about its enforcement. Two static signatures: the
// runner path mentioned in a SKILL.md, and a SKILL.md containing a rule id
// defined by a sibling module in the same skill directory.
//
// RELEVANCE FIRST (see checks/README.md "Adding a rule"): a skill check runs on
// EVERY repo, but corpus skills exist only in the canon home — gate on the
// skills registry being tracked, the same gate skill-ownership uses.
const SKILL_MD = /^skills\/([^/]+)\/SKILL\.md$/;
const RUNNER = /checks\/run\.mjs/;
const RULE_ID = /\bid:\s*'([a-z][\w-]+)'/g;

const rule = {
  id: 'skill-no-enforcement-narration',
  severity: 'blocking',
  description: 'A corpus SKILL.md neither tells the reader to run the checks runner nor names the rules its own checks enforce',
  doc: 'skills/writing-claudinite-skills/SKILL.md',
  why: 'checks run automatically at every Stop and in CI, and each failure message carries its rule — a skill narrating its own enforcement duplicates the mechanism and drifts from it',

  run(ctx) {
    if (!ctx.tracked.includes('skills/registry.mjs')) return [];
    const out = [];
    for (const f of ctx.files) {
      const m = SKILL_MD.exec(f);
      if (!m) continue;
      const text = ctx.read(f);
      if (text === null) continue;
      const lines = text.split('\n');

      const runnerLine = lines.findIndex((ln) => RUNNER.test(ln));
      if (runnerLine !== -1) {
        out.push(finding(rule, {
          file: f, line: runnerLine + 1,
          what: 'tells the reader to run the checks runner',
          fix: 'delete the instruction — the Stop hook and CI run every check on their own',
        }));
      }

      const dir = dirname(f);
      const ownIds = new Set();
      for (const sib of ctx.files) {
        if (dirname(sib) !== dir || !sib.endsWith('.mjs')) continue;
        const src = ctx.read(join(sib));
        if (src === null) continue;
        for (const idMatch of src.matchAll(RULE_ID)) ownIds.add(idMatch[1]);
      }
      for (const id of [...ownIds].sort()) {
        const line = lines.findIndex((ln) => ln.includes(id));
        if (line === -1) continue;
        out.push(finding(rule, {
          file: f, line: line + 1,
          what: `names its own check rule "${id}"`,
          fix: 'remove the mention — the rule announces itself when it fires, and its failure message carries the instruction',
        }));
      }
    }
    return out;
  },
};

export default rule;
