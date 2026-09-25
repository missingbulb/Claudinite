// Project-aspect standard pack: the self-growing product research wiki under
// product-wiki/, isolated behind the reviewed product-requirements crossing
// point, and fingerprinted on that sink.
import { SINK_README } from './lib.mjs';

export default {
  version: '60925.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'agent-maintained market, user and competitor research wikis — cited pages, growth logs, the reviewed product-requirements sink',
    excludes: 'how the product is built or specced — that is spec-driven-product; requirement proofs are executable-requirements',
  },
  marker: SINK_README,
  detect: (ctx) => ctx.tracked.includes(SINK_README),
  // The isolation wall (product-wiki-isolation) and the skeleton check
  // (product-wiki-layout) are a designed pair, both declared in this pack's
  // declared-checks.json: the wall's glob target fails closed on an empty
  // product-wiki/ expansion, and layout owns the missing-skeleton complaint.
  // Adoption interview: the answers frame WHICH wikis get seeded and what the
  // competitor set is measured against, and record as intent on the entry
  // (`answers`), never as config. Read the repo's own product brief or spec
  // first and confirm, rather than re-asking cold.
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
  // The pack's scheduled task — wiki-growth, the weekly research pass — lives in
  // this pack's `tasks/wiki-growth/`, discovered by the scheduler's filesystem
  // scan (packs/claudinite-tasks/discover.mjs), not declared here.
};
