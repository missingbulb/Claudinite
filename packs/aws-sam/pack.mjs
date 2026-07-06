import esbuildDependency from './esbuild-dependency.mjs';
import handlerPath from './handler-path.mjs';
import cloudfrontAuthorization from './cloudfront-authorization.mjs';

// Three of the pack's gotchas now have structural checks (via the minimal YAML
// parser); the jsdom-style runtime ones stay prose in RULES.md.
export default {
  id: 'aws-sam',
  always: false,
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
  prose: 'RULES.md',
  rules: [esbuildDependency, handlerPath, cloudfrontAuthorization],
};
