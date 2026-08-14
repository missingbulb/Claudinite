import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WIKI_PAGE, WIKI_RESERVED } from './lib.mjs';

// This pack's declared checks — the wiki page grammar as pattern specs, not
// code. The spec vocabulary is documented in the helper's header; each
// declaration below reads as its own contract (what it scans, what it
// requires, what the failure says).
const GROWTH_LOG_FIX = 'lead every growth-log bullet with the run date, e.g. "- **2026-07-15** — what changed"; append the seed entry when the page is first committed';

export const pageSections = patternRule({
  id: 'product-wiki-page-sections',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every wiki page carries Key insights, Sources, Growth log, and Open questions sections',
  why: "the sections are the page's reader header plus the wiki's audit trail and backlog — without them compile-once/refine-in-place degrades to unsourced, unreviewable rewrites nobody can read at a glance",
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    sections: ['Key insights', 'Sources', 'Growth log', 'Open questions'],
    requirePresent: {
      what: 'wiki page is missing its "## {section}" section',
      fix: 'add it — every wiki page opens with the Key insights header, then carries the growth machinery: the citations list, the dated growth log, and the open-questions backlog (an empty "## Open questions" is valid)',
    },
  }],
});

export const keyInsights = patternRule({
  id: 'product-wiki-key-insights',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every wiki page opens with a succinct bulleted Key insights header',
  why: 'a research page whose findings can only be recovered by reading it end to end does not get read — the header is what makes a compiled wiki usable to a human',
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    section: 'Key insights',
    requireFirstOnPage: {
      what: 'the page opens with "## {first}", not its "## Key insights" header',
      fix: 'move "## Key insights" above every other section — a header a reader reaches after the body is not a header',
    },
    forbidProseLines: {
      what: 'prose in the Key insights header: "{line}"',
      fix: 'the header is a bulleted list only — make it a bullet or move it into the page body below the "## Key insights" section',
    },
    maxBulletBlockLength: {
      characters: 140,
      what: 'Key insights bullet runs {characters} characters (max 140): "{bullet}…"',
      fix: 'cut it to the finding in plain words — the qualifiers, the supporting detail and the citation all live in the page body',
    },
    minBullets: {
      count: 1,
      what: 'Key insights header carries no bullets',
      fix: 'open the page with "## Key insights" — up to 7 bullets, each one finding stated plainly in a line (max 140 characters), together enough for a reader to understand what the research found without reading the body',
    },
    maxBullets: {
      count: 7,
      what: 'Key insights header carries {bullets} bullets (max 7) — it has grown into a second body',
      fix: 'keep the 7 that matter most; the rest is what the page body is for',
    },
  }],
});

export const growthLog = patternRule({
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
      whenUndated: { what: 'growth-log entry does not lead with its date: "{bullet}"', fix: GROWTH_LOG_FIX },
      whenNotRealDate: { what: 'growth-log entry "{date}" is not a real calendar date', fix: GROWTH_LOG_FIX },
    },
    minBullets: { count: 1, what: 'growth log has no dated entries', fix: GROWTH_LOG_FIX },
  }],
});

export const sources = patternRule({
  id: 'product-wiki-sources',
  severity: 'blocking',
  doc: 'packs/product-wiki/README.md',
  description: 'Every Sources bullet carries its real URL',
  why: 'a named source without its URL is an uncited citation — unverifiable by the next pass and by review',
  scanFiles: WIKI_PAGE,
  excludeFiles: WIKI_RESERVED,
  checkSections: [{
    section: 'Sources',
    eachBulletBlockMatches: {
      pattern: /https?:\/\//,
      what: 'Sources bullet carries no URL: "{bullet}"',
      fix: 'every listed source carries its real URL (a markdown link or a bare URL); an honestly-unsourced page explains its status in prose instead of listing URL-less sources',
    },
  }],
});

export const freshness = patternRule({
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

export default [pageSections, keyInsights, growthLog, sources, freshness];
