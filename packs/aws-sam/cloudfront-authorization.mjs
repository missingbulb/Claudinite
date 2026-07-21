import { finding } from '../../engine/checks/helpers/findings.mjs';
import { samResources } from '../../engine/checks/helpers/sam-templates.mjs';

// Converted from the aws-sam prose (issue #136): a custom
// AWS::CloudFront::OriginRequestPolicy listing Authorization is rejected at deploy
// ("The parameter Headers contains Authorization that is not allowed"). Use the
// managed AllViewerExceptHostHeader policy plus a cache policy that omits it.
// Blocking — the deploy fails otherwise.
//
// FP guard (from adversarial mining): scoped to the policy resource's own Headers,
// so Authorization elsewhere (an API Gateway authorizer's IdentitySource) is fine.
const rule = {
  id: 'aws-sam/cloudfront-authorization',
  severity: 'blocking',
  description: "A custom CloudFront OriginRequestPolicy may not list Authorization in its headers",
  doc: 'packs/aws-sam/RULES.md',
  why: 'CloudFront rejects a custom origin-request policy that forwards Authorization at deploy time',

  run(ctx) {
    const out = [];
    for (const { templatePath, name, resource } of samResources(ctx)) {
      if (resource.Type !== 'AWS::CloudFront::OriginRequestPolicy') continue;
      const headers = resource.Properties
        ?.OriginRequestPolicyConfig?.HeadersConfig?.Headers;
      if (Array.isArray(headers) && headers.some((h) => String(h).toLowerCase() === 'authorization')) {
        out.push(finding(rule, {
          file: templatePath,
          what: `${name}: custom OriginRequestPolicy lists Authorization in its headers`,
          fix: 'drop Authorization from the custom policy and attach the managed AllViewerExceptHostHeader policy (id b689b0a8-53d0-40ab-baf2-68738e2966ac) to forward it, with a cache policy that omits it from the cache key',
        }));
      }
    }
    return out;
  },
};

export default rule;
