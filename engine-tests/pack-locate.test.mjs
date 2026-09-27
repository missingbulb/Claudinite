import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';

// A locate's `search` terms are what a reader holding only GitHub's API searches for
// before it reads anything, so a file its `text` matches but no term finds is a pack
// that reader never suggests. Each sample below is a file the pack's own text pattern
// matches; every one must carry a term, as GitHub's code search matches them: whole
// words, in any case.
const SAMPLES = { // @real-entity each real pack's own search terms are what is under test
  'chrome-extension': ['{ "manifest_version": 3 }'], // @real-entity
  'cloudflare-site': ['{ "assets": { "directory": "./site" } }'], // @real-entity
  'headless-browser': ["import { chromium } from 'playwright';", "const p = require('puppeteer-core');", 'await webkit.launch()'], // @real-entity
  jwt: ["require('jsonwebtoken')", "import { jwtVerify } from 'jose'", 'import jwt\n', 'from jwt.utils import x', "require('express-jwt')", "require('jwks-rsa')", "require('node-jose')"], // @real-entity
  leaflet: ['<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js">', 'L.tileLayer(url)', 'L.markerClusterGroup()'], // @real-entity
  'numpy-image-processing': ['numpy\nscipy\n'], // @real-entity
  'public-website': ['<footer title="version 1.2.3">'], // @real-entity
  'web-speech': ['new webkitSpeechRecognition()', 'new SpeechRecognition()', 'speechSynthesis.speak(u)', 'new SpeechSynthesisUtterance(t)', 'chrome.tts.speak(t)', 'SpeechRecognitionPhrase'], // @real-entity
};

const words = (text) => new Set(text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));

test('every text locate on the shelf is found by its own search terms', async () => {
  const { packs } = await discoverPacks();
  const withText = packs.filter((p) => p.locate?.text);
  assert.deepEqual(withText.map((p) => p.id).sort(), Object.keys(SAMPLES).sort(), 'a pack gained or lost a text locate - give it samples here');
  for (const pack of withText) {
    const terms = pack.locate.search.map((t) => t.toLowerCase());
    for (const sample of SAMPLES[pack.id]) {
      const matched = [].concat(pack.locate.text).every((r) => r.test(sample));
      assert.ok(matched, `${pack.id}: the sample ${JSON.stringify(sample)} is not one its text matches`);
      const found = words(sample);
      assert.ok(terms.some((t) => found.has(t)), `${pack.id}: no search term finds ${JSON.stringify(sample)}`);
    }
  }
});
