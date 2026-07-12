import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext, loadConfig } from '../lib/context.mjs';

test('loadConfig: clean settings validate with no errors; a missing file is empty and error-free', () => {
  const ok = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: ['basics'], rules: {}, maintenance: { delivery: 'push' } }) } });
  const none = makeRepo({ changed: {} });
  try {
    assert.deepEqual(loadConfig(ok).errors, []);
    assert.deepEqual(loadConfig(ok).packs, ['basics']);
    assert.deepEqual(loadConfig(none).errors, []);
  } finally { cleanup(ok); cleanup(none); }
});

test('loadConfig: an unknown top-level property is reported, valid keys still parse', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: ['basics'], nonsense: 1 }) } });
  try {
    const cfg = loadConfig(root);
    assert.equal(cfg.errors.length, 1);
    assert.match(cfg.errors[0].what, /unknown setting "nonsense"/);
    assert.deepEqual(cfg.packs, ['basics']); // the good keys still load
  } finally { cleanup(root); }
});

test('loadConfig: malformed JSON and a non-object root each report one error', () => {
  const bad = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": [ ' } });
  const arr = makeRepo({ changed: { '.claudinite-checks.json': '["basics"]' } });
  try {
    assert.match(loadConfig(bad).errors[0].what, /not valid JSON/);
    assert.match(loadConfig(arr).errors[0].what, /must be a JSON object/);
  } finally { cleanup(bad); cleanup(arr); }
});

test('engine: ctx.files excludes vendored/generated files; ctx.allFiles keeps them', () => {
  // The default sweep is the project's own code — so every check skips third-party
  // and machine-written files for free, not just warning-suppression.
  const root = makeRepo({ changed: {
    '.gitattributes': 'vendor/** linguist-vendored\ngen/** linguist-generated\n',
    'vendor/page.html': '<div>recorded third-party fixture</div>\n',
    'gen/out.js': 'machineWritten();\n',
    'src/mine.js': 'projectCode();\n',
  } });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    assert.ok(!ctx.files.includes('vendor/page.html'));
    assert.ok(!ctx.files.includes('gen/out.js'));
    assert.ok(ctx.files.includes('src/mine.js'));
    // The unfiltered set retains them for checks that reason about generated files.
    assert.ok(ctx.allFiles.includes('vendor/page.html'));
    assert.ok(ctx.allFiles.includes('gen/out.js'));
  } finally { cleanup(root); }
});
