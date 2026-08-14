import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

// This pack's declared checks — pattern specs, not code. The spec vocabulary is
// documented in the helper's header; each declaration below reads as its own
// contract (what it scans, what it requires, what the failure says).

export const esbuildDependency = patternRule({
  id: 'aws-sam/esbuild-dependency',
  severity: 'blocking',
  description: 'esbuild must be a regular dependency, not a devDependency, for SAM esbuild builds',
  doc: 'packs/aws-sam/RULES.md',
  why: "SAM's esbuild builder runs a production-only npm install, so a devDependency esbuild is skipped and the build fails",
  relevantWhen: {
    someTrackedFileContains: { pathMatching: /(^|\/)template\.ya?ml$/, text: /BuildMethod:\s*esbuild/ },
    exactlyOneTrackedFileMatches: /(^|\/)package\.json$/,
  },
  checkParsedFile: [{
    file: 'package.json',
    whenFieldPresent: 'devDependencies.esbuild',
    requireField: 'dependencies.esbuild',
    what: 'esbuild is a devDependency, but SAM BuildMethod: esbuild needs it as a regular dependency',
    fix: 'move esbuild into "dependencies" (SAM\'s build runs a production-only npm install), or put it on the runner PATH before `sam build`',
  }],
});

export const cloudfrontAuthorization = patternRule({
  id: 'aws-sam/cloudfront-authorization',
  severity: 'blocking',
  description: 'A custom CloudFront OriginRequestPolicy may not list Authorization in its headers',
  doc: 'packs/aws-sam/RULES.md',
  why: 'CloudFront rejects a custom origin-request policy that forwards Authorization at deploy time',
  forEachParsedEntry: [{
    inFilesMatching: /(^|\/)template\.ya?ml$/,
    entriesAtField: 'Resources',
    whereFieldEquals: { field: 'Type', equals: 'AWS::CloudFront::OriginRequestPolicy' },
    forbidValueInArray: {
      atField: 'Properties.OriginRequestPolicyConfig.HeadersConfig.Headers',
      value: 'authorization',
      ignoreCase: true,
    },
    what: '{entry}: custom OriginRequestPolicy lists Authorization in its headers',
    fix: 'drop Authorization from the custom policy and attach the managed AllViewerExceptHostHeader policy (id b689b0a8-53d0-40ab-baf2-68738e2966ac) to forward it, with a cache policy that omits it from the cache key',
  }],
});

export default [esbuildDependency, cloudfrontAuthorization];
