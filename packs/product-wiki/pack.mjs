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

export default {
  id: 'product-wiki',
  badge: {
    file: 'badge.svg',
    color: '#be185d',
    glyph: 'M16 11.5c-1.8-1.9-4.6-2.5-6.6-2.5v12.6c2 0 4.8.6 6.6 2.4 1.8-1.8 4.6-2.4 6.6-2.4V9c-2 0-4.8.6-6.6 2.5z M16 11.5v12.5',
  },
  marker: SINK_README,
  detect: (ctx) => ctx.tracked.includes(SINK_README),
  prose: 'RULES.md',
  // The isolation wall rides the barriers mechanism: this pack requires
  // barriers and CONTRIBUTES the fixed barrier as manifest data
  // (isolation.mjs — pure data, no cross-pack import; pack-independence).
  requires: ['barriers'],
  contributes: { barriers: [isolation] },
  rules: [layout, pageSections, growthLog, sources, freshness],
  // The pack's scheduled task — wiki-growth, the weekly research pass — lives in
  // this pack's `tasks/wiki-growth/`, discovered by the scheduler's filesystem
  // scan (engine/scheduler/discover.mjs), not declared here.
};
