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

const EXPECTS = frontmatter.EXPECTS ?? ['adoption', 'triggered', 'judgment'];
// How many force-load declarations the frontmatter carries, read as text: the
// count is all this needs, and the engine's own parser is probed above for the
// block rather than for this.
const triggerCount = (text) => (text.slice(0, text.indexOf('\n---', 3) + 1).match(/^\s*force-load-on-\S+:/gm) ?? []).length;

const canRead = () => typeof frontmatter.usageOf === 'function' && typeof frontmatter.parseFrontmatter === 'function';

const rule = {
  id: 'skill-usage-declared',
  severity: 'blocking',
  since: '2026-09-21',
  description: `A corpus SKILL.md declares metadata.usage.expect (${EXPECTS.join(' | ')}), and a skill expecting "triggered" carries a force-load declaration for its loads to be judged against`,
  doc: 'packs/claudinite-canon-curation/skills/writing-claudinite-skills/SKILL.md',
  why: 'without a declared expectation, a skill that never loads and one that is never needed read the same zero, and the usage review cannot tell a broken skill from a healthy one',

  run({ sources }) {
    if (!canRead()) return [];
    const out = [];
    for (const { file, text } of sources(SKILL_DOC)) {
      const usage = frontmatter.usageOf(frontmatter.parseFrontmatter(text));
      if (usage === null) {
        out.push(finding(rule, {
          file,
          what: 'declares no metadata.usage block',
          fix: `add one under metadata - "usage:" then "expect:" one of ${EXPECTS.join(' | ')}; a skill that loads at its own force-load moments and nowhere else is "triggered"`,
        }));
        continue;
      }
      // `triggered` claims the skill's own force-load declarations are when it
      // loads, and the review judges its loads against the moments those named.
      // A skill declaring none has no such moments, so the claim is one its own
      // file contradicts - the one half of the expectation a check can settle.
      // The converse is NOT a fault: a skill may carry a trigger and still expect
      // most of its loads to come by judgment, which is a real claim about itself.
      if (usage.expect === 'triggered' && triggerCount(text) === 0) {
        out.push(finding(rule, {
          file,
          what: 'expects "triggered" and declares no force-load trigger to be triggered by',
          fix: 'declare the force-load moment it loads at, or expect "judgment" - loaded when the model judges its description fits',
        }));
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
