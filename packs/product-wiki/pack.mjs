// Project-aspect standard pack: the self-growing product research wiki
// (compile-once/refine-in-place, cited, dated, isolated behind the reviewed
// product-requirements crossing point). The folder is the classifier: the two
// reserved names (product-requirements/, sample-data/) have fixed meaning;
// everything else under product/ is wiki space. Fingerprinted by the
// standard's one structural constant — the sink.
import layout from './layout.mjs';
import pageSections from './page-sections.mjs';
import growthLog from './growth-log.mjs';
import sources from './sources.mjs';
import freshness from './freshness.mjs';
import isolation from './isolation.mjs';
import wikiGrowth from './run_daily/wiki-growth.mjs';

export default {
  id: 'product-wiki',
  marker: 'product/product-requirements/README.md',
  detect: (ctx) => ctx.tracked.includes('product/product-requirements/README.md'),
  prose: 'RULES.md',
  rules: [layout, pageSections, growthLog, sources, freshness, isolation],
  run_daily: [wikiGrowth],
};
