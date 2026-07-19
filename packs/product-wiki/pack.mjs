// Project-aspect standard pack: the self-growing product research wiki
// (compile-once/refine-in-place, cited, dated, isolated behind the reviewed
// product-requirements crossing point). The folder is the classifier: the two
// reserved names (product-requirements/, sample-data/) have fixed meaning;
// everything else under product-wiki/ is wiki space. Fingerprinted by the
// standard's one structural constant — the sink.
import { SINK_README } from './lib.mjs';
import layout from './layout.mjs';
import pageSections from './page-sections.mjs';
import growthLog from './growth-log.mjs';
import sources from './sources.mjs';
import freshness from './freshness.mjs';
import isolation from './isolation.mjs';
import wikiGrowth from './run_daily/wiki-growth.mjs';

export default {
  id: 'product-wiki',
  marker: SINK_README,
  detect: (ctx) => ctx.tracked.includes(SINK_README),
  prose: 'RULES.md',
  // The isolation wall rides the barriers mechanism: this pack requires
  // barriers and CONTRIBUTES the fixed barrier as manifest data
  // (isolation.mjs — pure data, no cross-pack import; pack-independence).
  requires: ['barriers'],
  contributes: { barriers: [isolation] },
  rules: [layout, pageSections, growthLog, sources, freshness],
  run_daily: [wikiGrowth],
};
