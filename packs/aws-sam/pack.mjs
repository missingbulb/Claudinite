import handlerPath from './handler-path.mjs';

// Three of the pack's gotchas now have structural checks (via the minimal YAML
// parser); the jsdom-style runtime ones stay prose in RULES.md.
export default {
  id: 'aws-sam',
  version: 1,
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'serverless AWS stacks: SAM template shape, Lambda handler paths, esbuild bundling, API Gateway and CloudFront gotchas',
    excludes: 'backend Google ID token validation — google-identity; generic Node packaging habits — node',
  },
  badge: 'badge.svg',
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
  prose: 'RULES.md',
  worldRules: [handlerPath],
};
