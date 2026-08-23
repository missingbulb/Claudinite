import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import assetIntegrity from '../worldRules/asset-integrity.mjs';

const run = (rule, root) => rule.run(buildContext({ root, mode: 'all' }));

const page = (body) => makeRepo({ changed: { 'index.html': body } });

const CORE_JS =
  '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>';
const CORE_CSS =
  '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />';

test('leaflet/asset-integrity: flags the plugin tag left bare beside a wired core bundle', () => {
  const root = page(`<head>
${CORE_CSS}
${CORE_JS}
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
</head>
`);
  try {
    const findings = run(assetIntegrity, root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'index.html');
    assert.equal(findings[0].line, 4);
    assert.match(findings[0].what, /leaflet\.markercluster/);
    assert.match(findings[0].what, /integrity/);
    assert.match(findings[0].what, /crossorigin/);
    // Pinned, so only the two missing attributes are named.
    assert.doesNotMatch(findings[0].what, /version pin/);
  } finally { cleanup(root); }
});

test('leaflet/asset-integrity: flags an unpinned URL, naming the pin as what is missing', () => {
  const root = page(`<script src="https://unpkg.com/leaflet@latest/dist/leaflet.js" integrity="sha256-abc" crossorigin=""></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet/dist/leaflet.css" integrity="sha512-abc" crossorigin>
`);
  try {
    const findings = run(assetIntegrity, root);
    assert.equal(findings.length, 2);
    for (const f of findings) assert.match(f.what, /version pin/);
  } finally { cleanup(root); }
});

test('leaflet/asset-integrity: clean when core and plugin are both pinned + hashed', () => {
  const root = page(`<head>
${CORE_CSS}
${CORE_JS}
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js" integrity="sha256-WL3FnpU4nH8HnEXHzMKnUCFHrPZ0J5MZ0RGGHhPTQ+E=" crossorigin=""></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js" integrity="sha512-abc" crossorigin="anonymous"></script>
</head>
`);
  try {
    assert.deepEqual(run(assetIntegrity, root), []);
  } finally { cleanup(root); }
});

test('leaflet/asset-integrity: NOT flagged for a locally vendored asset (FP guard)', () => {
  // A same-origin file is not a third-party fetch — SRI and crossorigin are for
  // the CDN case the rule is about.
  const root = page(`<link rel="stylesheet" href="vendor/leaflet.css">
<script src="/js/leaflet.js"></script>
<link rel="preconnect" href="https://unpkg.com">
`);
  try {
    assert.deepEqual(run(assetIntegrity, root), []);
  } finally { cleanup(root); }
});

test('leaflet/asset-integrity: NOT flagged for a non-Leaflet CDN tag, or a Leaflet URL in page text (FP guard)', () => {
  const root = page(`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<p>We load Leaflet from https://unpkg.com/leaflet/dist/leaflet.js — see the docs.</p>
<script>const CORE = 'https://unpkg.com/leaflet/dist/leaflet.js';</script>
`);
  try {
    assert.deepEqual(run(assetIntegrity, root), []);
  } finally { cleanup(root); }
});

test('leaflet/asset-integrity: NOT flagged inside an HTML comment (FP guard)', () => {
  const root = page(`<!-- never write this:
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
-->
${CORE_JS}
`);
  try {
    assert.deepEqual(run(assetIntegrity, root), []);
  } finally { cleanup(root); }
});
