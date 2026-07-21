import { finding } from '../../engine/checks/lib/findings.mjs';
import { wikiPages, sectionBody, BULLET, DATED, realDateUTC } from './lib.mjs';

// Growth-log discipline: every top-level bullet in the section leads with its
// run date (bold or plain — the invariant is dating, not typography), the date
// is a real calendar date, and a seeded page has at least one entry (a page
// with content and an empty log never recorded its seed). Indented
// continuation lines and prose paragraphs are ignored; the bullet/date grammar
// is lib.mjs's, shared with the freshness advisory so the two checks can never
// disagree about what an entry date is. Deliberately absent: ordering (a
// backdated correction is legitimate) and any wall-clock rule (staleness is
// the freshness advisory's job).
const FIX = 'lead every growth-log bullet with the run date, e.g. "- **2026-07-15** — what changed"; append the seed entry when the page is first committed';

const rule = {
  id: 'product-wiki-growth-log',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every Growth log entry is a dated bullet (real YYYY-MM-DD), and a seeded page has at least one',
  why: 'undated or absent log entries break the audit trail and the freshness signal every other growth mechanism keys on',

  run(ctx) {
    const out = [];
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      const section = sectionBody(text, 'growth log');
      if (section === null) continue; // page-sections owns the missing heading
      let bullets = 0;
      for (const { line, text: t } of section) {
        if (!BULLET.test(t)) continue; // top-level bullets only
        bullets += 1;
        const m = DATED.exec(t);
        if (!m) {
          out.push(finding(rule, {
            file: page, line,
            what: `growth-log entry does not lead with its date: "${t.trim().slice(0, 80)}"`,
            fix: FIX,
          }));
          continue;
        }
        if (realDateUTC(+m[1], +m[2], +m[3]) === null) {
          out.push(finding(rule, {
            file: page, line,
            what: `growth-log entry "${m[1]}-${m[2]}-${m[3]}" is not a real calendar date`,
            fix: FIX,
          }));
        }
      }
      if (bullets === 0) {
        out.push(finding(rule, { file: page, what: 'growth log has no dated entries', fix: FIX }));
      }
    }
    return out;
  },
};

export default rule;
