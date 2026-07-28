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
  marker: SINK_README,
  detect: (ctx) => ctx.tracked.includes(SINK_README),
  prose: 'RULES.md',
  // The isolation wall rides the barriers mechanism: this pack requires
  // barriers and CONTRIBUTES the fixed barrier as manifest data
  // (isolation.mjs — pure data, no cross-pack import; pack-independence).
  requires: ['barriers'],
  contributes: { barriers: [isolation] },
  // Growth only ever refines an EXISTING wiki's own "## Open questions"
  // backlog (RULES.md: "research what it flags as open, thin, or dated") — an
  // agent adopting this pack with no wikis yet scaffolded has no backlog to
  // work from and no way to guess one. Adoption asks the owner which wikis to
  // seed and what each should track, same rationale as barriers asking what
  // the graph is FOR: the guided on-ramp beats both running empty and
  // guessing topics from existing state.
  questions: [{
    id: 'seed-wikis',
    prompt: 'Which product-research wikis should this repo start with, and what should each track — e.g. '
      + '"Market" (competitive landscape, positioning), "Users" (personas, jobs-to-be-done), "Competitors" '
      + '(named rivals and their moves)? Name at least one wiki and its first "## Open questions" — growth '
      + 'passes only ever research what an existing wiki\'s own backlog already flags.',
    distill: 'no entry config — the pack takes none; instead scaffold one product-wiki/<Name>/README.md per '
      + 'named wiki (the seed template in this pack\'s README.md), each carrying its own initial '
      + '"## Open questions" drawn from the answer',
  }],
  rules: [layout, pageSections, growthLog, sources, freshness],
  // The pack's scheduled task — wiki-growth, the weekly research pass — lives in
  // this pack's `tasks/wiki-growth/`, discovered by the scheduler's filesystem
  // scan (engine/scheduler/discover.mjs), not declared here.
};
