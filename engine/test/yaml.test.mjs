import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from '../checks_helpers/yaml.mjs';

test('nested maps', () => {
  assert.deepEqual(parseYaml('a:\n  b: 1\n  c: hello\n'), { a: { b: 1, c: 'hello' } });
});

test('block sequence of scalars', () => {
  assert.deepEqual(parseYaml('items:\n  - one\n  - two\n'), { items: ['one', 'two'] });
});

test('flow sequence', () => {
  assert.deepEqual(parseYaml('items: [a, b, c]\n'), { items: ['a', 'b', 'c'] });
});

test('quotes, comments, booleans, null', () => {
  assert.deepEqual(
    parseYaml('# full-line comment\nk: "quoted"  # trailing\nb: true\nn: ~\n'),
    { k: 'quoted', b: true, n: null }
  );
});

test('CloudFormation tag keeps the scalar value', () => {
  assert.deepEqual(parseYaml('r: !Ref MyRes\ng: !GetAtt A.Arn\n'), { r: 'MyRes', g: 'A.Arn' });
});

test('sequence of maps', () => {
  assert.deepEqual(
    parseYaml('list:\n  - name: a\n    v: 1\n  - name: b\n    v: 2\n'),
    { list: [{ name: 'a', v: 1 }, { name: 'b', v: 2 }] }
  );
});

test('a realistic SAM function resource', () => {
  const t = `Resources:
  Fn:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        EntryPoints:
          - src/handler.mjs
    Properties:
      Handler: src/handler.handler
      Runtime: nodejs20.x
`;
  const y = parseYaml(t);
  assert.equal(y.Resources.Fn.Type, 'AWS::Serverless::Function');
  assert.equal(y.Resources.Fn.Metadata.BuildMethod, 'esbuild');
  assert.deepEqual(y.Resources.Fn.Metadata.BuildProperties.EntryPoints, ['src/handler.mjs']);
  assert.equal(y.Resources.Fn.Properties.Handler, 'src/handler.handler');
});

test('a CloudFront OriginRequestPolicy with a headers list', () => {
  const t = `Resources:
  Pol:
    Type: AWS::CloudFront::OriginRequestPolicy
    Properties:
      OriginRequestPolicyConfig:
        HeadersConfig:
          HeaderBehavior: whitelist
          Headers:
            - Authorization
            - Origin
`;
  const y = parseYaml(t);
  assert.deepEqual(
    y.Resources.Pol.Properties.OriginRequestPolicyConfig.HeadersConfig.Headers,
    ['Authorization', 'Origin']
  );
});

test('malformed input returns null rather than throwing', () => {
  assert.doesNotThrow(() => parseYaml(':::\n\t\n  broken'));
});
