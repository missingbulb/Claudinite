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
  // Adoption interview: the standard takes no config (the layout IS the config),
  // but a wiki with no research scope is a hollow skeleton — the answers frame
  // WHICH wikis get seeded and what the competitor set is measured against. They
  // record as intent on the entry (`answers`), never as config. Read the repo's
  // own product brief/spec first and confirm, rather than re-asking cold.
  questions: [
    {
      id: 'product',
      prompt: "What is the product — what does it do, and what is the core value it delivers? If the repo already carries a product brief or spec, read it and confirm rather than asking cold.",
      distill: 'recorded as intent on this entry (the pack takes no config); it names what the research is about and frames every seeded wiki',
    },
    {
      id: 'users',
      prompt: 'Who are the users or customers — the segments whose needs the research must track?',
      distill: 'recorded as intent; scopes the user-research wiki and whose problems the findings answer to',
    },
    {
      id: 'market',
      prompt: 'What market or category is this in, and who are the main competitors or alternatives? This is what the competitor research is scoped against.',
      distill: 'recorded as intent; names the competitor set the initial competitor-landscape wiki is seeded from',
    },
  ],
  rules: [layout, pageSections, growthLog, sources, freshness],
  run_daily: [wikiGrowth],
};
