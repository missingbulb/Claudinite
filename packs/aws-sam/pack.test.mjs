import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import handlerPath from './handler-path.mjs';
import cloudfrontAuth from './cloudfront-authorization.mjs';
import esbuildDependency from './esbuild-dependency.mjs';

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

test('esbuild-dependency: flags devDependency esbuild under SAM esbuild build, passes as a regular dependency', () => {
  const tmpl = 'Resources:\n  Fn:\n    Metadata:\n      BuildMethod: esbuild\n';
  const bad = makeRepo({
    changed: { 'template.yaml': tmpl, 'package.json': JSON.stringify({ devDependencies: { esbuild: '^0.20' } }) },
  });
  const good = makeRepo({
    changed: { 'template.yaml': tmpl, 'package.json': JSON.stringify({ dependencies: { esbuild: '^0.20' } }) },
  });
  const noSam = makeRepo({
    changed: { 'package.json': JSON.stringify({ devDependencies: { esbuild: '^0.20' } }) },
  });
  try {
    const findings = run(esbuildDependency, bad);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(run(esbuildDependency, good).length, 0);
    assert.equal(run(esbuildDependency, noSam).length, 0);
  } finally { cleanup(bad); cleanup(good); cleanup(noSam); }
});

test('esbuild-dependency: a multi-package repo is not flagged (FP fix)', () => {
  // root esbuild devDep is legitimate tooling when the SAM function builds from
  // its own manifest — more than one package.json means skip
  const root = makeRepo({
    changed: {
      'template.yaml': 'Resources:\n  Fn:\n    Metadata:\n      BuildMethod: esbuild\n',
      'package.json': JSON.stringify({ devDependencies: { esbuild: '^0.20' } }),
      'fn/package.json': JSON.stringify({ dependencies: { esbuild: '^0.20' } }),
    },
  });
  try {
    assert.equal(run(esbuildDependency, root).length, 0);
  } finally { cleanup(root); }
});
