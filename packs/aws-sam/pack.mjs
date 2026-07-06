import esbuildDependency from './esbuild-dependency.mjs';

// The jsdom/CloudFront gotchas are prose (runtime/YAML, no clean static signature);
// the esbuild-dependency trap has one (package.json + template BuildMethod).
export default {
  id: 'aws-sam',
  always: false,
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
  prose: 'RULES.md',
  rules: [esbuildDependency],
};
