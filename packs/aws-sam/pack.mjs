
// The AWS Serverless Application Model and the API-Gateway/CloudFront stack it
// deploys: the gotchas any SAM project hits, as checks, prose and two skills.
export default {
  version: '60925.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'serverless AWS stacks: SAM template shape, Lambda handler paths, esbuild bundling, API Gateway and CloudFront gotchas',
    excludes: 'backend Google ID token validation — google-identity; generic Node packaging habits — node',
  },
  marker: 'a SAM template (template.yaml/.yml)',
  detect: (ctx) => ctx.tracked.includes('template.yaml') || ctx.tracked.includes('template.yml'),
};
