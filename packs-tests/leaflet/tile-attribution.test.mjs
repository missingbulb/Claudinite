import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import tileAttribution from '../../packs/leaflet/tile-attribution.mjs';

const run = (root) => tileAttribution.run(buildContext({ root, mode: 'all' }));
const repo = (files) => makeRepo({ changed: files });

const OSM = "'&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors'";

// ---------------------------------------------------------------- it fires

test('leaflet/tile-attribution: flags a literal options object with no attribution', () => {
  const root = repo({
    'js/app.js': `const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);
`,
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'leaflet/tile-attribution');
    assert.equal(findings[0].severity, 'blocking');
    assert.equal(findings[0].file, 'js/app.js');
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].what, /literal options object/);
  } finally { cleanup(root); }
});

test('leaflet/tile-attribution: flags a tileLayer built with no options at all', () => {
  const root = repo({ 'js/app.js': "L.tileLayer('https://tile.example/{z}/{x}/{y}.png').addTo(map);\n" });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].what, /no options at all/);
  } finally { cleanup(root); }
});

test('leaflet/tile-attribution: flags the bare layer beside a correctly attributed one', () => {
  const root = repo({
    'js/app.js': `const base = L.tileLayer('https://a.tile.example/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: ${OSM},
});
const overlay = L.tileLayer('https://b.tile.example/{z}/{x}/{y}.png', {
  opacity: 0.5,
  maxZoom: 19,
});
`,
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 5);
  } finally { cleanup(root); }
});

test('leaflet/tile-attribution: fires on an inline <script> in an HTML page, at its real line', () => {
  const root = repo({
    'index.html': `<!doctype html>
<div id="map"></div>
<script>
  const map = L.map('map').setView([51.5, -0.1], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
</script>
`,
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'index.html');
    assert.equal(findings[0].line, 5);
  } finally { cleanup(root); }
});

// ------------------------------------------------------- it stays quiet

test('leaflet/tile-attribution: clean when the options carry attribution', () => {
  const root = repo({
    'js/app.js': `L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: ${OSM},
}).addTo(map);
`,
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: quiet on a quoted attribution key', () => {
  const root = repo({
    'js/app.js': `L.tileLayer(url, { 'attribution': '© OSM', maxZoom: 19 });\n`,
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: quiet when the options come from a variable or a spread', () => {
  const root = repo({
    'js/app.js': `const TILE_OPTIONS = { attribution: ${OSM}, maxZoom: 19 };
L.tileLayer('https://a.tile.example/{z}/{x}/{y}.png', TILE_OPTIONS);
L.tileLayer('https://b.tile.example/{z}/{x}/{y}.png', { ...TILE_OPTIONS, opacity: 0.5 });
`,
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: quiet when the file registers the credit out of band', () => {
  const root = repo({
    'js/app.js': `L.tileLayer('https://tile.example/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
map.attributionControl.addAttribution(${OSM});
`,
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: quiet on L.tileLayer.wms, a different constructor', () => {
  const root = repo({
    'js/app.js': "L.tileLayer.wms('https://wms.example/service', { layers: 'base', maxZoom: 19 });\n",
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: quiet on a call site that only lives in a comment or page text', () => {
  const root = repo({
    'js/app.js': `// Never write L.tileLayer(url, { maxZoom: 19 }) without attribution.
/* L.tileLayer(url, {}) is the bad shape. */
`,
    'docs.html': `<!-- L.tileLayer(url, { maxZoom: 19 }) -->
<pre>L.tileLayer(url, { maxZoom: 19 })</pre>
`,
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: a comma inside the URL or a nested option does not confuse the split', () => {
  const root = repo({
    'js/app.js': `L.tileLayer('https://tile.example/{z}/{x}/{y}.png?k=a,b', {
  bounds: [[1, 2], [3, 4]],
  attribution: ${OSM},
});
`,
  });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});

test('leaflet/tile-attribution: quiet on a repo with no Leaflet source at all', () => {
  const root = repo({ 'js/app.js': "console.log('no maps here');\n" });
  try { assert.deepEqual(run(root), []); } finally { cleanup(root); }
});
