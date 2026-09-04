
// Three of the pack's gotchas have structural checks (via the minimal YAML
// parser); the rest are prose, in RULES.md or in the skill scoped to the file they concern.
export default {
  version: '60903.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'serverless AWS stacks: SAM template shape, Lambda handler paths, esbuild bundling, API Gateway and CloudFront gotchas',
    excludes: 'backend Google ID token validation — google-identity; generic Node packaging habits — node',
  },
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
};
