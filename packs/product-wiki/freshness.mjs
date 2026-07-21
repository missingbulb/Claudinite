import { finding } from '../../engine/checks/helpers/findings.mjs';
import { wikiPages, sectionBody, DATED, realDateUTC } from './lib.mjs';

// The staleness nag — ADVISORY by design, never blocking: it is time-driven
// and directional (it goes red with no change to the repo), which must never
// block a Stop or fail CI. It exists because it is the only in-repo observer
// for the real failure mode "the unattended growth channel silently stopped
// firing" — ~6 weekly cycles of silence earns a nag. Per-page (one active wiki
// must not mask starved siblings), gated on mode 'all' (a whole-repo
// assertion; the Stop hook and CI both run 'all', so coverage is unchanged).
//
// Only ENTRY dates count — the leading date of a top-level bullet, lib.mjs's
// DATED grammar shared with the growth-log check — never a date mentioned in
// an entry's body or the section's prose, which would silently reset the
// staleness clock this advisory exists to watch. Entry dates more than 2 days
// in the future are discarded so a typo'd future date can't mark a page fresh
// forever. Silence it with rules: {"product-wiki-freshness": "off"}.
const WINDOW_DAYS = 45;
const DAY = 86_400_000;

const rule = {
  id: 'product-wiki-freshness',
  severity: 'advisory',
  doc: 'packs/product-wiki/README.md',
  description: `A wiki page whose newest Growth log entry is older than ${WINDOW_DAYS} days needs a growth pass`,
  why: "a wiki that stopped growing silently stops being true — staleness must reach a human even when the unattended growth channel isn't firing",

  run(ctx) {
    if (ctx.mode !== 'all') return [];
    const out = [];
    const now = ctx.now ?? Date.now(); // ctx.now: injectable clock for tests / future core seam
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      const section = sectionBody(text, 'growth log');
      if (section === null) continue;
      const dates = [];
      for (const { text: t } of section) {
        const m = DATED.exec(t);
        if (!m) continue; // undated/malformed bullets are growth-log's territory
        const ts = realDateUTC(+m[1], +m[2], +m[3]);
        if (ts !== null && ts <= now + 2 * DAY) dates.push(ts);
      }
      if (!dates.length) continue;
      const newest = Math.max(...dates);
      const age = Math.floor((now - newest) / DAY);
      if (age > WINDOW_DAYS) {
        out.push(finding(rule, {
          file: page,
          what: `newest Growth log entry is ${age} days old (${new Date(newest).toISOString().slice(0, 10)}) — past the ${WINDOW_DAYS}-day freshness window`,
          fix: "run a product-wiki growth pass (in-session: \"grow the product wiki\"; method: the canon's packs/product-wiki/run_daily/wiki-growth.worker.md, mounted under .claudinite/ in consumers), or confirm the fleet daily routine is scheduled with this repo in scope; silence via rules: {\"product-wiki-freshness\": \"off\"}",
        }));
      }
    }
    return out;
  },
};

export default rule;
