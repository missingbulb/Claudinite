import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import handlerPath from '../../packs/aws-sam/handler-path.mjs';
import cloudfrontAuth from '../../packs/aws-sam/cloudfront-authorization.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const fn = (extra) => `Resources:
  Fn:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        EntryPoints:
          - src/handler.mjs
${extra}    Properties:
      Handler: src/handler.handler
`;

test('handler-path: flags a subdir Handler under single-entry esbuild', () => {
  const root = makeRepo({ changed: { 'template.yaml': fn('') } });
  try {
    const findings = run(handlerPath, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.match(findings[0].what, /src\/handler\.handler/);
  } finally { cleanup(root); }
});

test('handler-path: clean when the Handler drops the subdir', () => {
  const t = fn('').replace('Handler: src/handler.handler', 'Handler: handler.handler');
  const root = makeRepo({ changed: { 'template.yaml': t } });
  try {
    assert.equal(run(handlerPath, root).length, 0);
  } finally { cleanup(root); }
});

test('handler-path: NOT flagged when OutBase is set (FP fix)', () => {
  const withOutBase =
`      BuildProperties:
        EntryPoints:
          - src/handler.mjs
        OutBase: ./
`;
  // rebuild the function with OutBase present
  const t = `Resources:
  Fn:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: esbuild
${withOutBase}    Properties:
      Handler: src/handler.handler
`;
  const root = makeRepo({ changed: { 'template.yaml': t } });
  try {
    assert.equal(run(handlerPath, root).length, 0);
  } finally { cleanup(root); }
});

test('handler-path: NOT flagged with multiple entry points (FP fix)', () => {
  const t = `Resources:
  Fn:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        EntryPoints:
          - src/a.mjs
          - src/b.mjs
    Properties:
      Handler: src/a.handler
`;
  const root = makeRepo({ changed: { 'template.yaml': t } });
  try {
    assert.equal(run(handlerPath, root).length, 0);
  } finally { cleanup(root); }
});

const policy = (headers) => `Resources:
  Pol:
    Type: AWS::CloudFront::OriginRequestPolicy
    Properties:
      OriginRequestPolicyConfig:
        HeadersConfig:
          HeaderBehavior: whitelist
          Headers:
${headers.map((h) => `            - ${h}`).join('\n')}
`;

test('cloudfront-authorization: flags a custom policy listing Authorization', () => {
  const root = makeRepo({ changed: { 'template.yaml': policy(['Authorization', 'Origin']) } });
  try {
    const findings = run(cloudfrontAuth, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
  } finally { cleanup(root); }
});

test('cloudfront-authorization: clean when the policy omits Authorization', () => {
  const root = makeRepo({ changed: { 'template.yaml': policy(['Origin', 'Host']) } });
  try {
    assert.equal(run(cloudfrontAuth, root).length, 0);
  } finally { cleanup(root); }
});

test('cloudfront-authorization: NOT flagged when Authorization is elsewhere (FP fix)', () => {
  // a policy WITHOUT Authorization, plus an API Gateway authorizer that names Authorization
  const t = `${policy(['Origin'])}  Api:
    Type: AWS::Serverless::Api
    Properties:
      Auth:
        Authorizers:
          JwtAuth:
            IdentitySource: Authorization
`;
  const root = makeRepo({ changed: { 'template.yaml': t } });
  try {
    assert.equal(run(cloudfrontAuth, root).length, 0);
  } finally { cleanup(root); }
});
