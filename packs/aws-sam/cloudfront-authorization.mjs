import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
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
