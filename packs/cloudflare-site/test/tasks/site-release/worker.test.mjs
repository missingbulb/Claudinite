import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../../../../../engine/remove-tree.mjs';
import { BEACON_PLACEHOLDER, injectBeacon, isOperatorFailure, reportServed } from '../../../tasks/site-release/worker.mjs';

const REAL_TOKEN = '4f8b21ce9a7d4e0fb3c65a1d2e7f9081';

const withTree = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'site-release-test-'));
  mkdirSync(join(dir, 'site'));
  try { return fn(dir); } finally { removeTree(dir); }
};

const loader = (dir, body) => {
  writeFileSync(join(dir, 'site', 'analytics.js'), body);
  return join(dir, 'site', 'analytics.js');
};

test('a configured beacon token reaches the uploaded copy', () => {
  withTree((dir) => {
    const path = loader(dir, `var TOKEN = '${BEACON_PLACEHOLDER}';\n`);
    assert.equal(injectBeacon(dir, ['site/analytics.js'], REAL_TOKEN), true);
    const text = readFileSync(path, 'utf8');
    assert.ok(text.includes(REAL_TOKEN));
    assert.ok(!text.includes(BEACON_PLACEHOLDER));
  });
});

// The published tree is walked, so a repo whose loader is a page's inline script, or
// sits under a subdirectory, is substituted too.
test('every published file carrying the placeholder is substituted', () => {
  withTree((dir) => {
    mkdirSync(join(dir, 'site', 'assets'));
    writeFileSync(join(dir, 'site', 'index.html'), `<script>t='${BEACON_PLACEHOLDER}'</script>`);
    writeFileSync(join(dir, 'site', 'assets', 'a.js'), `t='${BEACON_PLACEHOLDER}'`);
    assert.equal(injectBeacon(dir, ['site/index.html', 'site/assets/a.js'], REAL_TOKEN), true);
    assert.ok(readFileSync(join(dir, 'site', 'index.html'), 'utf8').includes(REAL_TOKEN));
    assert.ok(readFileSync(join(dir, 'site', 'assets', 'a.js'), 'utf8').includes(REAL_TOKEN));
  });
});

// The documented off state, and the one the run must be able to report: with no
// variable set the placeholder ships and the loader no-ops.
test('no variable leaves the placeholder in place and says analytics is off', () => {
  withTree((dir) => {
    const path = loader(dir, `var TOKEN = '${BEACON_PLACEHOLDER}';\n`);
    assert.equal(injectBeacon(dir, ['site/analytics.js'], undefined), false);
    assert.equal(injectBeacon(dir, ['site/analytics.js'], ''), false);
    assert.ok(readFileSync(path, 'utf8').includes(BEACON_PLACEHOLDER));
  });
});

// A value that is not a beacon token would be substituted into a string literal in a
// script every visitor runs, so it is refused rather than shipped.
test('a malformed variable stops the release instead of shipping it', () => {
  withTree((dir) => {
    const path = loader(dir, `var TOKEN = '${BEACON_PLACEHOLDER}';\n`);
    assert.throws(() => injectBeacon(dir, ['site/analytics.js'], "'); alert(1); //"), /malformed/);
    assert.ok(readFileSync(path, 'utf8').includes(BEACON_PLACEHOLDER));
  });
});

test('a token with nowhere to go stops the release', () => {
  withTree((dir) => {
    loader(dir, "var TOKEN = 'already-something-else';\n");
    assert.throws(() => injectBeacon(dir, ['site/analytics.js'], REAL_TOKEN), /placeholder/);
  });
});

// The park lane is chosen from wrangler's own output, and the two lanes mean different
// things to whoever opens the item: one is a five-second settings fix, the other is a
// trace to read.
test('Cloudflare refusals route to the human-action lane', () => {
  assert.equal(isOperatorFailure('x [ERROR] A request to the Cloudflare API failed. [code: 10000] Authentication error'), true);
  assert.equal(isOperatorFailure('Could not find zone for example.com'), true);
  assert.equal(isOperatorFailure('x [ERROR] Build failed with 1 error: unexpected token'), false);
  assert.equal(isOperatorFailure(''), false);
  assert.equal(isOperatorFailure(undefined), false);
});

// A release is not finished when the API returns 200 — what matters is that a visitor
// reaches the page — and the run is the only place that is ever checked. A hostname
// that does not answer is REPORTED, since the version is cut and the upload happened.
test('what each hostname answered is reported, errors included', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('www.')) throw new Error('ENOTFOUND');
    return { status: 200 };
  };
  assert.deepEqual(await reportServed(['example.com', 'www.example.com'], { fetchImpl }), [
    { hostname: 'example.com', status: 200 },
    { hostname: 'www.example.com', error: 'ENOTFOUND' },
  ]);
});
