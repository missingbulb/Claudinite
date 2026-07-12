import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';

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
