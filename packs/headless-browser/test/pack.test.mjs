import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import * as detectorSpec from '../../../engine/pack_loader/relevance-detector.mjs';

const pack = (await loadPacks()).find((p) => p.id === 'headless-browser'); // @real-entity the pack under test

const fires = (files) => detectorSpec.detectsRelevance(pack.relevanceDetector, {
  tracked: Object.keys(files),
  read: (f) => files[f] ?? null,
});

test('headless-browser: fingerprint fires on a browser driver a dependency manifest declares', () => {
  assert.equal(fires({ 'package.json': '{ "devDependencies": { "@playwright/test": "^1.47.0" } }\n' }), true);
  assert.equal(fires({ 'e2e/package.json': '{ "dependencies": { "puppeteer-core": "^23.0.0" } }\n' }), true);
  assert.equal(fires({ 'requirements-dev.txt': 'pytest\nplaywright==1.47.0\n' }), true);
  assert.equal(fires({ 'pyproject.toml': '[tool.poetry.dependencies]\npyppeteer = "^1.0"\n' }), true);
});

test('headless-browser: fingerprint is silent on source no manifest backs, and on a driver named in prose', () => {
  assert.equal(fires({ 'capture/shoot.mjs': "import { chromium } from 'playwright';\n" }), false);
  assert.equal(fires({ 'package.json': '{ "description": "playwright tests for the site" }\n' }), false);
  assert.equal(fires({ 'package.json': '{ "devDependencies": { "playwright-lighthouse": "^4.0.0" } }\n' }), false);
});
