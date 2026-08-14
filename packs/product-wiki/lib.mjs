import { finding } from '../../engine/checks/helpers/findings.mjs';

// The standard's path constants — spelled ONCE here so the manifest, the
// barrier, and the layout check can't drift apart. The wiki set is STRUCTURAL,
// not configured: a wiki page is a README.md at depth >= 2 under product-wiki/,
// outside the two reserved subtrees (product-requirements/ — the human-reviewed
// sink — and sample-data/ — illustrative assets). No wikis manifest exists
// anywhere, so a renamed or newly added wiki folder is classified correctly with
// nothing to drift (folder-is-the-classifier). That classifier and the
// section/bullet/date grammar the page checks assert live in declared-checks.json
// beside this file, run by the declarative engine
// (engine/checks/helpers/pattern-rules.mjs) — one grammar there, so the checks
// that share it can never disagree about it.
export const PRODUCT_ROOT = 'product-wiki';
export const SINK_DIR = 'product-wiki/product-requirements';
export const SAMPLE_DATA_DIR = 'product-wiki/sample-data';
export const INDEX_README = 'product-wiki/README.md';
export const SINK_README = 'product-wiki/product-requirements/README.md';

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
