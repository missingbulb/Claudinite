// The drift guard on the coverage map (README.md "## Coverage" section).
//
// The map claims every design decision is validated by a named test. Both
// halves of that claim can rot independently: DESIGN §15 gains a decision
// nobody maps, or a test gets renamed and the map cites a ghost. Each half is
// a real two-artifact claim, so each is pinned here; the map's *content* —
// whether the cited test actually validates the cited decision — stays a
// review concern, which is exactly what a coverage gate cannot check
// (see writing-tests: a claimed item is not a verified item).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const readme = readFileSync(here('README.md'), 'utf8');
const design = readFileSync(here('../DESIGN.md'), 'utf8');
const suite = readFileSync(here('scenarios.test.mjs'), 'utf8');

const mapSection = readme.split('## Coverage')[1]?.split('\n## ')[0];
assert.ok(mapSection, 'README has a Coverage section');

test('every §15 decision has a row in the coverage map', () => {
  const s15 = design.split(/^## 15\./m)[1]?.split(/^## /m)[0];
  assert.ok(s15, 'DESIGN has a §15');
  const decisions = [...s15.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  assert.ok(decisions.length >= 13, `found ${decisions.length} decisions`);
  for (const n of decisions) {
    // a ROW must exist — an incidental mention in another row's text (e.g.
    // "superseded by §15.13") must not satisfy the map
    assert.ok(new RegExp(`^\\| §15\\.${n} `, 'm').test(mapSection),
      `decision §15.${n} has no coverage-map row`);
  }
});

test('every test the coverage map cites exists in scenarios.test.mjs', () => {
  const titles = [...suite.matchAll(/^test\(["'](.+?)["'],/gm)].map((m) => m[1]);
  const firstWords = new Set(titles.map((t) => t.split(' ')[0]));
  assert.ok(firstWords.size > 20, 'test titles parsed');
  const cited = [...mapSection.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1])
    .filter((tok) => /^(S\d|backlog)/.test(tok));
  assert.ok(cited.length > 30, 'map cites tests');
  for (const tok of cited) {
    assert.ok(firstWords.has(tok), `map cites "${tok}" but no test title starts with it`);
  }
});
