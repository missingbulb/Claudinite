import { finding } from '../../../../engine/checks/helpers/findings.mjs';
// A NAMESPACE import, not named ones: `usageOf` and `EXPECTS` are newer than this
// pack's delivery of this check, and the two lanes ship on separate cadences, so a
// named import of an export the member's engine lacks is a link-time SyntaxError
// that faults the whole pack. Read through a capability probe instead, and stay
// silent where the engine cannot answer - a check that cannot read the block has
// nothing to say about it.
import * as frontmatter from '../../../../engine/pack_loader/skill-frontmatter.mjs';

// A corpus SKILL.md declares what usage it expects of itself, under its
// frontmatter `metadata.usage`. Without it, "this skill never loads" means
// nothing: a version-bump skill and a broken one read the same zero. With it, the
// zero is either exactly right or exactly the finding.
//
// The check exists because the declaration is otherwise unenforced - the harness
// never reads `metadata`, so a mis-declared expectation stays silent until the
// usage review lists the skill as unstated a month later and a reader wonders why.
// It is caught at authoring time instead, through the same reader the review uses,
// so the two can never disagree about what a block says.
//
// RELEVANCE FIRST: anchored at `packs/<pack>/skills/`, which no repo without a
// shelf has, so it is inert outside a canon exactly as its sibling is.
const SKILL_DOC = /(^|\/)packs\/[^/]+\/skills\/[^/]+\/SKILL\.md$/;

const EXPECTS = frontmatter.EXPECTS ?? ['adoption', 'routine', 'triggered', 'rare'];
const canRead = () => typeof frontmatter.usageOf === 'function' && typeof frontmatter.parseFrontmatter === 'function';

const rule = {
  id: 'skill-usage-declared',
  severity: 'blocking',
  since: '2026-09-21',
  description: `A corpus SKILL.md declares metadata.usage.expect (${EXPECTS.join(' | ')}), with loads-per-sessions as "1 in N" where and only where it expects routine`,
  doc: 'packs/claudinite-canon-curation/skills/writing-claudinite-skills/SKILL.md',
  why: 'without a declared expectation, a skill that never loads and one that is never needed read the same zero, and the usage review cannot tell a broken skill from a healthy one',

  run(ctx) {
    if (!canRead()) return [];
    const out = [];
    for (const file of ctx.files.filter((f) => SKILL_DOC.test(f))) {
      const text = ctx.read(file);
      if (text === null) continue;
      const usage = frontmatter.usageOf(frontmatter.parseFrontmatter(text));
      if (usage === null) {
        out.push(finding(rule, {
          file,
          what: 'declares no metadata.usage block',
          fix: `add one under metadata - "usage:" then "expect:" one of ${EXPECTS.join(' | ')}; a skill that loads at its own force-load moments and nowhere else is "triggered"`,
        }));
        continue;
      }
      for (const problem of usage.problems) {
        out.push(finding(rule, {
          file,
          what: `its metadata.usage ${problem}`,
          fix: 'correct the block - the usage review reads it exactly as this check does',
        }));
      }
    }
    return out;
  },
};

export default rule;
