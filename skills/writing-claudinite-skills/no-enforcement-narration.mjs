import { finding } from '../../checks/lib/findings.mjs';
import { narrationViolations } from '../../checks/lib/narration.mjs';

// A corpus SKILL.md must not narrate its own enforcement — rationale and the
// scanning live in checks/lib/narration.mjs (shared with the pack-side rule).
//
// RELEVANCE FIRST (see checks/README.md "Adding a rule"): a skill check runs on
// EVERY repo, but corpus skills exist only in the canon home — gate on the
// skills registry being tracked, the same gate skill-ownership uses.
const rule = {
  id: 'skill-no-enforcement-narration',
  severity: 'blocking',
  description: 'A corpus SKILL.md neither tells the reader to run the checks runner nor names the rules its own checks enforce',
  doc: 'skills/writing-claudinite-skills/SKILL.md',
  why: 'checks run automatically at every Stop and in CI, and each failure message carries its rule — a skill narrating its own enforcement duplicates the mechanism and drifts from it',

  run(ctx) {
    if (!ctx.tracked.includes('skills/registry.mjs')) return [];
    return ctx.files
      .filter((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f))
      .flatMap((f) => narrationViolations(ctx, f).map((v) => finding(rule, { file: f, ...v })));
  },
};

export default rule;
