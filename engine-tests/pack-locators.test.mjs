import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPacks, PACK_LOCATORS_FILE } from '../engine/pack_loader/pack-registry.mjs';
import { renderPackLocators } from './pack-locators.mjs';
import { removeTree } from '../engine/remove-tree.mjs';

// packs/locators.GENERATED.mjs is rendered from the manifests and vendored into every
// mount. Like the directory, this test maintains the committed file: locally it
// regenerates it (deterministic, so an up-to-date run yields no diff), under CI it only
// asserts, so a pack change that forgets to regenerate fails with the fix named.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, PACK_LOCATORS_FILE);

test('packs/locators.GENERATED.mjs is current with the pack manifests', async () => {
  const packs = await loadPacks();
  const rendered = renderPackLocators(packs, ROOT);
  if (!process.env.CI && (!existsSync(path) || readFileSync(path, 'utf8') !== rendered)) writeFileSync(path, rendered);
  assert.ok(existsSync(path), `${PACK_LOCATORS_FILE} is missing - run this test locally (it regenerates the file) and commit the result`);
  assert.equal(readFileSync(path, 'utf8'), rendered,
    `${PACK_LOCATORS_FILE} is stale against the pack manifests - run this test locally (it regenerates the file) and commit the result in the same change that touched the packs`);
});

// The contexts a fingerprint is judged over: this canon's own tree, and one synthetic
// tree per fingerprinted pack carrying what its marker names. Each locator loaded from
// the generated file must answer exactly what the pack's own detect answers.
function contexts(packs) {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  const own = { tracked, read: (f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return null; } } };
  const synthetic = {
    'android/app/src/main/AndroidManifest.xml': '<manifest/>', // @real-entity the marker this pack's real fingerprint looks for
    'template.yaml': 'Transform: AWS::Serverless-2016-10-31',
    'manifest.json': '{"manifest_version": 3, "name": "x"}',
    'wrangler.json': '{"name": "x", "assets": {"directory": "./site"}}',
    'dev/requirements/requirements.md': '# requirements',
    'firebase.json': '{}',
    'pubspec.yaml': 'name: x',
    'ios/Runner/Info.plist': '<plist/>', // @real-entity the marker this pack's real fingerprint looks for
    'Package.swift': '// swift',
    'package.json': '{}',
    'pyproject.toml': '[project]',
    'requirements.txt': 'numpy\nscipy\n',
    'product-wiki/product-requirements/README.md': '# r', // @real-entity the marker this pack's real fingerprint looks for
    'src/a.js': "import { chromium } from 'playwright'; import jwt from 'jsonwebtoken'; const r = new SpeechRecognition(); L.map('m');",
    'index.html': '<footer title="version 1.2.3">x</footer>',
  };
  const each = Object.entries(synthetic).map(([f, text]) => ({ tracked: [f], read: (p) => (p === f ? text : null) }));
  const all = { tracked: Object.keys(synthetic), read: (p) => synthetic[p] ?? null };
  return [own, all, ...each, { tracked: [], read: () => null }];
}

test('each generated locator answers what its pack\'s own detect answers', async () => {
  const packs = await loadPacks();
  const dir = mkdtempSync(join(tmpdir(), 'locators-'));
  try {
    // Loaded from a copy outside the tree, so nothing resolves against the canon's files.
    const copy = join(dir, 'locators.mjs');
    writeFileSync(copy, renderPackLocators(packs, ROOT));
    const { PACKS, loadLocators } = await import(pathToFileURL(copy).href);
    const locators = await loadLocators();
    const fingerprinted = packs.filter((p) => !p.hidden && typeof p.detect === 'function');
    assert.ok(fingerprinted.length > 10, 'the tree has too few fingerprinted packs - this test is reading the wrong one');
    assert.deepEqual([...locators.keys()].sort(), fingerprinted.map((p) => p.id).sort());
    let fired = 0;
    for (const ctx of contexts(packs)) {
      for (const p of fingerprinted) {
        const want = Boolean(p.detect(ctx));
        assert.equal(Boolean(locators.get(p.id)(ctx)), want, `${p.id} disagrees over [${ctx.tracked.slice(0, 3).join(', ')}]`);
        if (want) fired += 1;
      }
    }
    assert.ok(fired >= fingerprinted.length, `only ${fired} fingerprints fired across the contexts - the synthetic tree no longer exercises them`);
    assert.deepEqual(PACKS.map((p) => p.id), packs.filter((p) => !p.hidden).map((p) => p.id).sort());
    for (const p of PACKS) assert.equal(typeof p.pitch, 'string', `${p.id} carries no pitch`);
  } finally {
    removeTree(dir);
  }
});

test('a locator importing something a browser cannot load is refused at render', () => {
  const dir = mkdtempSync(join(tmpdir(), 'locators-bad-'));
  try {
    writeFileSync(join(dir, 'pack.mjs'), "import { readFileSync } from 'node:fs';\nexport default { detect: () => Boolean(readFileSync) };\n");
    const pack = { id: 'acme-pack', dir, detect: () => true, ruleRoutingGuidance: { belongs: 'b', excludes: 'e' } };
    assert.throws(() => renderPackLocators([pack], dir), /imports "node:fs"/);
  } finally {
    removeTree(dir);
  }
});
