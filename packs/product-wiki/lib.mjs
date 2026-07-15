import { finding } from '../../checks/lib/findings.mjs';

// Shared helpers for the product-wiki checks. The wiki set is STRUCTURAL, not
// configured: a wiki page is a README.md at depth >= 2 under product/, outside
// the two reserved subtrees (product-requirements/ — the human-reviewed sink —
// and sample-data/ — illustrative assets). No wikis manifest exists anywhere,
// so a renamed or newly added wiki folder is classified correctly with nothing
// to drift (the folder-is-the-classifier lesson).
const RESERVED = ['product/product-requirements/', 'product/sample-data/'];

export function wikiPages(files) {
  return files.filter(
    (f) => /^product\/.+\/README\.md$/.test(f) && !RESERVED.some((r) => f.startsWith(r))
  );
}

// The lines of the `## <name>` section (case-insensitive; suffix words after
// the name are fine — "## Open questions (for the next pass)") up to the next
// `## ` heading or EOF. Each entry carries its 1-indexed file line so findings
// can pin the offending bullet. Returns null when the heading is absent —
// callers skip then, because the missing heading is page-sections' finding
// (never double-report).
export function sectionBody(text, name) {
  const lines = text.split('\n');
  const heading = new RegExp(`^##\\s+${name}\\b`, 'i');
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return { lines: lines.slice(start + 1, end).map((t, i) => ({ line: start + 2 + i, text: t })) };
}

// The pack takes no config — the product/ layout IS the standard. A config
// object on the pack entry is a settings mistake (probably a misremembered
// knob), surfaced once, by the layout check only (no cascade).
export function configGuard(ctx, rule) {
  const cfg = ctx.config?.packConfig?.['product-wiki'];
  if (cfg === undefined || cfg === null) return [];
  return [finding(rule, {
    file: '.claudinite-checks.json',
    what: 'product-wiki config: the pack takes no config — the product/ layout is the standard',
    fix: 'remove the "config" object from the product-wiki pack entry (to silence the freshness advisory use rules: {"product-wiki-freshness": "off"})',
    severity: 'blocking',
  })];
}
