import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WIKI_PAGE, WIKI_RESERVED } from './lib.mjs';

export default patternRule({
  id: 'product-wiki-freshness',
  severity: 'advisory',
  doc: 'packs/product-wiki/README.md',
  description: 'A wiki page whose newest Growth log entry is older than 45 days needs a growth pass',
  why: "a wiki that stopped growing silently stops being true — staleness must reach a human even when the unattended growth channel isn't firing",
  relevantWhen: { scanningWholeRepo: true },
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    section: 'Growth log',
    newestDatedBulletWithinDays: {
      days: 45,
      what: 'newest Growth log entry is {age} days old ({date}) — past the {days}-day freshness window',
      fix: 'run a product-wiki growth pass (in-session: "grow the product wiki"; method: the canon\'s packs/product-wiki/tasks/wiki-growth/task.md, mounted under .claudinite/ in consumers), or confirm this repo\'s scheduler workflow is wired and the wiki-growth task is on its schedule; silence via rules: {"product-wiki-freshness": "off"}',
    },
  }],
});
