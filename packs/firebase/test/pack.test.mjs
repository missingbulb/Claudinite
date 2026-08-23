import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, declaredCheck } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import functionsPredeployBuild from '../worldRules/functions-predeploy-build.mjs';

const functionsNodePin = declaredCheck('packs/firebase', 'firebase/functions-node-pin');

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const json = (o) => JSON.stringify(o, null, 2);

// A conventional single-codebase project: firebase.json at the repo root, the
// functions package one directory down.
const project = ({ firebase = {}, pkg = {} } = {}) => ({
  'firebase.json': json({ functions: { source: 'functions', ...firebase } }),
  'functions/package.json': json({ name: 'fns', ...pkg }),
});

test('functions-node-pin: flags a deployed functions package with no engines.node', () => {
  const root = makeRepo({ changed: project() });
  try {
    const findings = run(functionsNodePin, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'functions/package.json');
    assert.match(findings[0].what, /no engines\.node/);
  } finally { cleanup(root); }
});

test('functions-node-pin: clean when the package pins a Node major', () => {
  const root = makeRepo({ changed: project({ pkg: { engines: { node: '22' } } }) });
  try {
    assert.equal(run(functionsNodePin, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-node-pin: an empty engines.node is still a missing pin', () => {
  const root = makeRepo({ changed: project({ pkg: { engines: { node: '  ' } } }) });
  try {
    assert.equal(run(functionsNodePin, root).length, 1);
  } finally { cleanup(root); }
});

test('functions-node-pin: silent on a Firebase project that deploys no functions', () => {
  const root = makeRepo({
    changed: {
      'firebase.json': json({ hosting: { public: 'public' } }),
      // an unrelated package.json in the tree must not be mistaken for a codebase
      'functions/package.json': json({ name: 'not-deployed' }),
    },
  });
  try {
    assert.equal(run(functionsNodePin, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-node-pin: silent when the declared codebase is not in this checkout', () => {
  const root = makeRepo({ changed: { 'firebase.json': json({ functions: { source: 'functions' } }) } });
  try {
    assert.equal(run(functionsNodePin, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-node-pin: a nested example firebase.json is out of the marker scope (FP fix)', () => {
  const root = makeRepo({
    changed: {
      'examples/demo/firebase.json': json({ functions: { source: 'functions' } }),
      'examples/demo/functions/package.json': json({ name: 'demo' }),
    },
  });
  try {
    assert.equal(run(functionsNodePin, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-node-pin: a project root one directory down resolves source relative to it', () => {
  const root = makeRepo({
    changed: {
      'firebase/firebase.json': json({ functions: [{ source: 'fns', codebase: 'default' }] }),
      'firebase/fns/package.json': json({ name: 'fns' }),
    },
  });
  try {
    const findings = run(functionsNodePin, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'firebase/fns/package.json');
  } finally { cleanup(root); }
});

test('functions-predeploy-build: flags a build script with no predeploy hook', () => {
  const root = makeRepo({ changed: project({ pkg: { scripts: { build: 'tsc' } } }) });
  try {
    const findings = run(functionsPredeployBuild, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'firebase.json');
    assert.match(findings[0].what, /no predeploy hook/);
  } finally { cleanup(root); }
});

test('functions-predeploy-build: clean when the build is wired as predeploy', () => {
  const root = makeRepo({
    changed: project({
      firebase: { predeploy: ['npm --prefix functions run build'] },
      pkg: { scripts: { build: 'tsc' } },
    }),
  });
  try {
    assert.equal(run(functionsPredeployBuild, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-predeploy-build: a string predeploy counts too', () => {
  const root = makeRepo({
    changed: project({
      firebase: { predeploy: 'npm --prefix functions run build' },
      pkg: { scripts: { build: 'tsc' } },
    }),
  });
  try {
    assert.equal(run(functionsPredeployBuild, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-predeploy-build: an empty predeploy array is not a hook', () => {
  const root = makeRepo({
    changed: project({ firebase: { predeploy: [] }, pkg: { scripts: { build: 'tsc' } } }),
  });
  try {
    assert.equal(run(functionsPredeployBuild, root).length, 1);
  } finally { cleanup(root); }
});

test('functions-predeploy-build: silent for a plain-JS codebase with no build script (FP fix)', () => {
  const root = makeRepo({ changed: project({ pkg: { scripts: { test: 'node --test' } } }) });
  try {
    assert.equal(run(functionsPredeployBuild, root).length, 0);
  } finally { cleanup(root); }
});

test('functions-predeploy-build: each declared codebase is judged on its own entry', () => {
  const root = makeRepo({
    changed: {
      'firebase.json': json({
        functions: [
          { source: 'api', codebase: 'api', predeploy: ['npm --prefix api run build'] },
          { source: 'jobs', codebase: 'jobs' },
        ],
      }),
      'api/package.json': json({ name: 'api', scripts: { build: 'tsc' } }),
      'jobs/package.json': json({ name: 'jobs', scripts: { build: 'tsc' } }),
    },
  });
  try {
    const findings = run(functionsPredeployBuild, root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /"jobs"/);
  } finally { cleanup(root); }
});
