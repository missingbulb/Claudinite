import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import wallClock from '../../packs/executable-requirements/requirements-case-wall-clock.mjs';

const SPEC = 'dev/requirements/requirements.md';
const SPEC_BODY = '`1.1` the header greets the arriving user\n';

// The requirements tree is repo state, so every fixture commits it and the rule
// sweeps the world. `packConfig` moves the spec (and therefore the tree root).
function run(files, { packConfig } = {}) {
  const root = makeRepo({ base: files });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    if (packConfig !== undefined) {
      ctx.config = { ...ctx.config, packConfig: { 'executable-requirements': packConfig } };
    }
    return wallClock.run(ctx);
  } finally { cleanup(root); }
}

// ---------------------------------------------------------------- it fires

test('requirements-case-wall-clock: flags Date.now() in a case file', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/popup/cases/greeting.1.1.case.mjs': `export const data = {
  lastSeen: new Date(Date.now() - 60_000),
};
`,
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'requirements-case-wall-clock');
  assert.equal(f[0].severity, 'blocking');
  assert.equal(f[0].file, 'dev/requirements/popup/cases/greeting.1.1.case.mjs');
  assert.equal(f[0].line, 2);
  assert.match(f[0].what, /Date\.now\(\)/);
  assert.match(f[0].fix, /REFERENCE_NOW/);
});

test('requirements-case-wall-clock: flags an argument-less new Date()', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/logic/cases/expiry.2.1.case.js': "const today = new Date();\nexport default { today };\n",
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 1);
  assert.match(f[0].what, /new Date\(\)/);
});

test('requirements-case-wall-clock: flags DateTime.now() in a Dart case', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/screen/cases/feed.3.1.case.dart': "final now = DateTime.now();\n",
  });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /DateTime\.now\(\)/);
});

test('requirements-case-wall-clock: flags a wall clock read inside a template literal', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/behavior/cases/upload.4.1.case.mjs': 'const id = `upload-${Date.now()}`;\n',
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 1);
});

test('requirements-case-wall-clock: flags a `*.case.*` file outside a cases/ directory', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/saga/arrival.5.1.case.mjs': "const t = Date.now();\n",
  });
  assert.equal(f.length, 1);
});

test('requirements-case-wall-clock: reports every read in the file, in source order', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/popup/cases/clocks.1.2.case.mjs': `const a = new Date();
const b = 1;
const c = Date.now();
`,
  });
  assert.deepEqual(f.map((x) => x.line), [1, 3]);
  assert.match(f[0].what, /new Date\(\)/);
  assert.match(f[1].what, /Date\.now\(\)/);
});

test('requirements-case-wall-clock: judges the tree of a spec moved by config.spec', () => {
  const files = {
    'spec/requirements.md': SPEC_BODY,
    'spec/popup/cases/greeting.1.1.case.mjs': "const t = Date.now();\n",
  };
  assert.equal(run(files).length, 0, 'no spec at the default path ⇒ nothing judged');
  assert.equal(run(files, { packConfig: { spec: 'spec/requirements.md' } }).length, 1);
});

// ------------------------------------------------------- it stays quiet

test('requirements-case-wall-clock: quiet on a case built from the pinned reference time', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/popup/cases/greeting.1.1.case.mjs': `import { REFERENCE_NOW } from '../../shared/clock.mjs';

export const data = {
  now: new Date(REFERENCE_NOW),
  epoch: Date.UTC(2026, 0, 1),
  lastSeen: new Date(REFERENCE_NOW.getTime() - 60_000),
};
`,
  });
  assert.deepEqual(f, []);
});

test('requirements-case-wall-clock: quiet on a comment that names the gotcha', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/popup/cases/greeting.1.1.case.mjs': `// Never Date.now() here — the clock is pinned.
/* new Date() would make this golden rot; DateTime.now() likewise. */
export const data = { now: REFERENCE_NOW };
`,
  });
  assert.deepEqual(f, []);
});

test('requirements-case-wall-clock: quiet when the case installs a fake instead of calling the clock', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/popup/cases/greeting.1.1.case.mjs': `Date.now = () => REFERENCE_NOW.getTime();
jest.spyOn(Date, 'now').mockReturnValue(0);
`,
  });
  assert.deepEqual(f, []);
});

test('requirements-case-wall-clock: quiet on the tree\'s runners and gates — only cases are judged', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/run.mjs': "const started = Date.now();\nconst dir = `failures/${new Date().toISOString()}`;\n",
    'dev/requirements/shared/report.mjs': "export const stamp = () => Date.now();\n",
  });
  assert.deepEqual(f, []);
});

test('requirements-case-wall-clock: quiet on product code outside the requirements tree', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'src/cases/greeting.case.mjs': "const t = Date.now();\n",
    'src/app.js': "const t = Date.now();\n",
  });
  assert.deepEqual(f, []);
});

test('requirements-case-wall-clock: quiet in a repo with no executable spec at all', () => {
  const f = run({ 'src/cases/thing.case.mjs': "const t = Date.now();\n" });
  assert.deepEqual(f, []);
});

// The self-skip proper: the tree's shape is there, the spec the framework
// activates on is not — so there is no framework to enforce and no reference
// time to point the fix at.
test('requirements-case-wall-clock: quiet on a requirements-shaped tree with no spec file', () => {
  const f = run({ 'dev/requirements/popup/cases/greeting.1.1.case.mjs': "const t = Date.now();\n" });
  assert.deepEqual(f, []);
});

test('requirements-case-wall-clock: quiet on a non-code file in a cases/ directory', () => {
  const f = run({
    [SPEC]: SPEC_BODY,
    'dev/requirements/popup/cases/README.md': "Author fixtures relative to REFERENCE_NOW, never Date.now().\n",
  });
  assert.deepEqual(f, []);
});
