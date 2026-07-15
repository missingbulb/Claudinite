import { finding } from '../../checks/lib/findings.mjs';
import { wikiPages, sectionBody } from './lib.mjs';

// The staleness nag — ADVISORY by design, never blocking: it is time-driven
// and directional (it goes red with no change to the repo), which must never
// block a Stop or fail CI. It exists because it is the only in-repo observer
// for the real failure mode "the unattended growth channel silently stopped
// firing" — ~6 weekly cycles of silence earns a nag. Per-page (one active wiki
// must not mask starved siblings), gated on mode 'all' (a whole-repo
// assertion; the Stop hook and CI both run 'all', so coverage is unchanged).
// Dates more than 2 days in the future are discarded so a typo'd future date
// can't mark a page fresh forever. Silence it with
// rules: {"product-wiki-freshness": "off"}.
const WINDOW_DAYS = 45;
const DAY = 86_400_000;

const rule = {
  id: 'product-wiki-freshness',
  severity: 'advisory',
  doc: 'packs/product-wiki/README.md',
  description: `A wiki page whose newest Growth log date is older than ${WINDOW_DAYS} days needs a growth pass`,
  why: "a wiki that stopped growing silently stops being true — staleness must reach a human even when the unattended growth channel isn't firing",

  run(ctx) {
    if (ctx.mode !== 'all') return [];
    const out = [];
    const now = Date.now();
    for (const page of wikiPages(ctx.files)) {
      const text = ctx.read(page);
      if (text === null) continue;
      const section = sectionBody(text, 'growth log');
      if (section === null) continue;
      const dates = [];
      for (const { text: t } of section.lines) {
        for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
          const ts = Date.UTC(+m[1], +m[2] - 1, +m[3]);
          if (!Number.isNaN(ts) && ts <= now + 2 * DAY) dates.push(ts);
        }
      }
      if (!dates.length) continue; // undated logs are growth-log's territory
      const newest = Math.max(...dates);
      const age = Math.floor((now - newest) / DAY);
      if (age > WINDOW_DAYS) {
        out.push(finding(rule, {
          file: page,
          what: `newest Growth log entry is ${age} days old (${new Date(newest).toISOString().slice(0, 10)}) — past the ${WINDOW_DAYS}-day freshness window`,
          fix: 'run a product-wiki growth pass (in-session: "grow the product wiki"; method: packs/product-wiki/run_daily/wiki-growth.worker.md), or confirm the fleet daily routine is scheduled with this repo in scope; silence via rules: {"product-wiki-freshness": "off"}',
        }));
      }
    }
    return out;
  },
};

export default rule;
