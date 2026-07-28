import esbuildDependency from './esbuild-dependency.mjs';
import handlerPath from './handler-path.mjs';
import cloudfrontAuthorization from './cloudfront-authorization.mjs';

// Three of the pack's gotchas now have structural checks (via the minimal YAML
// parser); the jsdom-style runtime ones stay prose in RULES.md.
export default {
  id: 'aws-sam',
  badge: {
    file: 'badge.svg',
    color: '#ec7211',
    glyph: 'M11.5 21.5a4 4 0 0 1 .3-8A6 6 0 0 1 23 14.4a3.6 3.6 0 0 1-.6 7.1z',
  },
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
  prose: 'RULES.md',
  rules: [esbuildDependency, handlerPath, cloudfrontAuthorization],
};
