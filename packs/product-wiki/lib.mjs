import { finding } from '../../checks/lib/findings.mjs';
import { under } from '../barriers/engine.mjs';

// Shared helpers and the standard's path constants — spelled ONCE here so the
// checks, the manifest, and the barrier can't drift apart. The wiki set is
// STRUCTURAL, not configured: a wiki page is a README.md at depth >= 2 under
// product-wiki/, outside the two reserved subtrees (product-requirements/ — the
// human-reviewed sink — and sample-data/ — illustrative assets). No wikis
// manifest exists anywhere, so a renamed or newly added wiki folder is
// classified correctly with nothing to drift (folder-is-the-classifier).
export const PRODUCT_ROOT = 'product-wiki';
export const SINK_DIR = 'product-wiki/product-requirements';
export const SAMPLE_DATA_DIR = 'product-wiki/sample-data';
export const INDEX_README = 'product-wiki/README.md';
export const SINK_README = 'product-wiki/product-requirements/README.md';

export function wikiPages(files) {
  return files.filter(
    (f) => /^product-wiki\/.+\/README\.md$/.test(f) && !under(f, SINK_DIR) && !under(f, SAMPLE_DATA_DIR)
  );
}

// One bullet/date grammar for every check that reads a growth log: a top-level
// bullet (-, * or + at column 0) leading with its YYYY-MM-DD run date, bold or
// plain — the invariant is dating, not typography. Date.UTC ROLLS OVER
// out-of-range parts (2026-02-30 → March 2) instead of failing, so calendar
// validity needs the explicit round-trip below.
export const BULLET = /^[-*+]\s/;
export const DATED = /^[-*+]\s+(?:\*\*)?(\d{4})-(\d{2})-(\d{2})(?:\*\*)?\b/;
export function realDateUTC(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
    ? dt.getTime() : null;
}

// Blank out fenced code blocks, preserving line count — a template embedded in
// a ``` fence must neither satisfy a section requirement nor feed bullets into
// the section scans. Every section reader below works on the stripped text.
function stripFences(text) {
  let inFence = false;
  return text.split('\n').map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return ''; }
    return inFence ? '' : l;
  });
}

const headingRe = (name) => new RegExp(`^##\\s+${name}\\b`, 'i');

// Does the page carry a real (non-fenced) `## <name>` section heading?
// The single definition of the heading contract — sectionBody anchors on the
// same regex, so "present" and "readable" can never disagree.
export function hasSection(text, name) {
  const re = headingRe(name);
  return stripFences(text).some((l) => re.test(l));
}

// The lines of the `## <name>` section (case-insensitive; suffix words after
// the name are fine — "## Open questions (for the next pass)") up to the next
// `## ` heading or EOF, fenced content blanked. Each entry carries its
// 1-indexed file line so findings can pin the offending bullet. Returns null
// when the heading is absent — callers skip then, because the missing heading
// is page-sections' finding (never double-report).
export function sectionBody(text, name) {
  const lines = stripFences(text);
  const re = headingRe(name);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).map((t, i) => ({ line: start + 2 + i, text: t }));
}

// The pack takes no config — the product-wiki/ layout IS the standard. A config
// object on the pack entry is a settings mistake (probably a misremembered
// knob), surfaced once, by the layout check only (no cascade). Deliberately
// pack-local rather than a runner-level manifest flag: no other pack rejects
// config yet, and a core seam for it can subsume this when a second pack needs
// one. Known limit: riding a rule means rules:{"product-wiki-layout":"off"}
// silences the guard along with the check.
export function configGuard(ctx, rule) {
  const cfg = ctx.config?.packConfig?.['product-wiki'];
  if (cfg === undefined || cfg === null) return [];
  return [finding(rule, {
    file: '.claudinite-checks.json',
    what: 'product-wiki config: the pack takes no config — the product-wiki/ layout is the standard',
    fix: 'remove the "config" object from the product-wiki pack entry (to silence the freshness advisory use rules: {"product-wiki-freshness": "off"})',
  })];
}
