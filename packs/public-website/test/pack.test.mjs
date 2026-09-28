import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';

const pack = (await loadPacks()).find((p) => p.id === 'public-website'); // @real-entity the pack under test

// The pack composes with a hosting pack by that pack reaching its public seam — never
// the other way round — so nothing in the manifest may name one.
test('the manifest names no hosting pack', () => {
  const text = JSON.stringify(pack.ruleRoutingGuidance) + (pack.requires ?? []).join(' ');
  assert.doesNotMatch(text, /github-pages|cloudflare|pages\b/i);
});
