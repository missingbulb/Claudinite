// Prose-only pack (the statically-detectable SAM traps are a future check set).
export default {
  id: 'aws-sam',
  always: false,
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
  prose: 'RULES.md',
  rules: [],
};
