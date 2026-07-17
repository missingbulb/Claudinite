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

test('loadConfig: a pack entry object normalizes — id into packs, config into the packConfig view, accept with provenance', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    packs: [
      'basics',
      { id: 'barriers',
        config: { rules: [{ from: 'a', to: 'b' }] },
        rules: { 'file-placement': 'advisory' },
        accept: [{ rule: 'reference-integrity', path: 'x.md', reason: 'why' }] },
      { id: 'chrome-extension', via: ['chrome-extension-release'] },
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, []);
    assert.deepEqual(cfg.packs, ['basics', 'barriers', 'chrome-extension']);
    assert.deepEqual(cfg.packConfig, { barriers: { rules: [{ from: 'a', to: 'b' }] } });
    assert.deepEqual(cfg.rules, { 'file-placement': 'advisory' });
    // The entry-sourced acceptance carries its provenance: the pack that motivated it.
    assert.deepEqual(cfg.accept, [{ rule: 'reference-integrity', path: 'x.md', reason: 'why', pack: 'barriers' }]);
  } finally { cleanup(root); }
});

test('loadConfig: entry config overlays the legacy top-level packConfig, which stays readable', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    packs: ['node', { id: 'barriers', config: { rules: [] } }],
    packConfig: { node: { dirs: ['fn'] }, barriers: { rules: [{ from: 'x', to: 'y' }] } },
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.errors, []);
    assert.deepEqual(cfg.packConfig.node, { dirs: ['fn'] }); // legacy still read
    assert.deepEqual(cfg.packConfig.barriers, { rules: [] }); // the entry wins
  } finally { cleanup(root); }
});

test('loadConfig: pack-entry answers — verbatim strings kept, wrong shapes a settings error', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    packs: [
      { id: 'barriers', answers: { goals: 'keep core off pack names' } },
      { id: 'node', answers: ['nope'] },
      { id: 'html', answers: { q: 7 } },
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.deepEqual(cfg.packEntries.find((e) => e.id === 'barriers').answers, { goals: 'keep core off pack names' });
    assert.equal(cfg.errors.length, 2);
    assert.match(cfg.errors[0].what, /"answers" on the "node" pack entry must be/);
    assert.match(cfg.errors[1].what, /"answers" on the "html" pack entry must be/);
  } finally { cleanup(root); }
});

test('loadConfig: a malformed pack entry is a settings error — no id, unknown property, wrong shapes', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    packs: [
      { config: {} },
      { id: 'basics', nonsense: 1 },
      { id: 'node', config: [] },
      42,
    ],
  }) } });
  try {
    const cfg = loadConfig(root);
    assert.equal(cfg.errors.length, 4);
    assert.match(cfg.errors[0].what, /has no "id"/);
    assert.match(cfg.errors[1].what, /unknown property "nonsense" on the "basics" pack entry/);
    assert.match(cfg.errors[2].what, /"config" on the "node" pack entry must be/);
    assert.match(cfg.errors[3].what, /neither a pack id nor an entry object/);
    assert.deepEqual(cfg.packs, ['basics', 'node']); // the interpretable entries still load
  } finally { cleanup(root); }
});

test('loadConfig: conflicting severity overrides are a settings error, agreeing ones are not', () => {
  const conflicted = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    packs: [{ id: 'basics', rules: { 'file-placement': 'advisory' } }],
    rules: { 'file-placement': 'off' },
  }) } });
  const agreeing = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    packs: [{ id: 'basics', rules: { 'file-placement': 'off' } }],
    rules: { 'file-placement': 'off' },
  }) } });
  try {
    const bad = loadConfig(conflicted);
    assert.equal(bad.errors.length, 1);
    assert.match(bad.errors[0].what, /rule "file-placement" is set to "off" by the top-level "rules" and "advisory" by the "basics" pack entry/);
    assert.deepEqual(loadConfig(agreeing).errors, []);
    assert.deepEqual(loadConfig(agreeing).rules, { 'file-placement': 'off' });
  } finally { cleanup(conflicted); cleanup(agreeing); }
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
