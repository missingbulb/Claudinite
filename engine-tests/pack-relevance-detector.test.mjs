import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';

// A relevance detector's `search` terms are what a reader holding only GitHub's API searches for
// before it reads anything, so a file its `text` matches but no term finds is a pack
// that reader never suggests. Each sample below is a file the pack's own text pattern
// matches; every one must carry a term, as GitHub's code search matches them: whole
// words, in any case.
const SAMPLES = { // @real-entity each real pack's own search terms are what is under test
  'chrome-extension': ['{ "manifest_version": 3 }'], // @real-entity
  'cloudflare-site': ['{ "assets": { "directory": "./site" } }'], // @real-entity
  'headless-browser': ['{ "devDependencies": { "@playwright/test": "^1.47.0" } }', '"puppeteer-core": "^23.0.0"', 'playwright==1.47.0\n', 'dependencies = ["pyppeteer>=1.0"]'], // @real-entity
  jwt: ['"jsonwebtoken": "^9.0.2"', '"jose": "^5.9.0"', '"express-jwt": "^8.4.1"', '"jwks-rsa": "^3.1.0"', '"node-jose": "^2.2.0"', 'PyJWT==2.9.0\n', 'python-jose[cryptography]>=3.3\n'], // @real-entity
  leaflet: ['<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js">', 'L.tileLayer(url)', 'L.markerClusterGroup()'], // @real-entity
  'numpy-image-processing': ['numpy\nscipy\n'], // @real-entity
  'web-speech': ['new webkitSpeechRecognition()', 'new SpeechRecognition()', 'speechSynthesis.speak(u)', 'new SpeechSynthesisUtterance(t)', 'chrome.tts.speak(t)', 'SpeechRecognitionPhrase'], // @real-entity
};

const words = (text) => new Set(text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));

test('every text relevanceDetector on the shelf is found by its own search terms', async () => {
  const { packs } = await discoverPacks();
  const withText = packs.filter((p) => p.relevanceDetector?.text);
  assert.deepEqual(withText.map((p) => p.id).sort(), Object.keys(SAMPLES).sort(), 'a pack gained or lost a text relevanceDetector - give it samples here');
  for (const pack of withText) {
    const terms = pack.relevanceDetector.search.map((t) => t.toLowerCase());
    for (const sample of SAMPLES[pack.id]) {
      const matched = [].concat(pack.relevanceDetector.text).every((r) => r.test(sample));
      assert.ok(matched, `${pack.id}: the sample ${JSON.stringify(sample)} is not one its text matches`);
      const found = words(sample);
      assert.ok(terms.some((t) => found.has(t)), `${pack.id}: no search term finds ${JSON.stringify(sample)}`);
    }
  }
});
