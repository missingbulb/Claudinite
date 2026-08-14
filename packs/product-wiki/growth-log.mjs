import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WIKI_PAGE, WIKI_RESERVED } from './lib.mjs';

const FIX = 'lead every growth-log bullet with the run date, e.g. "- **2026-07-15** — what changed"; append the seed entry when the page is first committed';

export default patternRule({
  id: 'product-wiki-growth-log',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every Growth log entry is a dated bullet (real YYYY-MM-DD), and a seeded page has at least one',
  why: 'undated or absent log entries break the audit trail and the freshness signal every other growth mechanism keys on',
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    section: 'Growth log',
    eachBulletLeadsWithDate: {
      whenUndated: { what: 'growth-log entry does not lead with its date: "{bullet}"', fix: FIX },
      whenNotRealDate: { what: 'growth-log entry "{date}" is not a real calendar date', fix: FIX },
    },
    minBullets: { count: 1, what: 'growth log has no dated entries', fix: FIX },
  }],
});
