// The two-way drift guard between PRINCIPLES.md and the test suite it cites.
//
// A claim can rot two ways independently: a claim cites a test that was renamed
// or deleted, or a scenario gets written and nothing in the document ever comes
// to cite it (silently unverified, or silently redundant). Each half is a real
// two-artifact claim, so each is pinned here; the map's *content* — whether the
// cited test actually proves the cited claim — stays a review concern, which is
// exactly what a coverage gate cannot check (see writing-tests: a claimed item
// is not a verified item).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const principles = readFileSync(here('../../docs/PRINCIPLES.md'), 'utf8');
const suite = readFileSync(here('scenarios.test.mjs'), 'utf8');

// Every backtick-quoted token that looks like a scenario name (S<n>, an
// optional letter suffix, an optional trailing apostrophe for the primed
// scenarios) or the one bare-word scenario, `backlog`.
const SCENARIO_TOKEN = /^(S\d+[a-z]?'?|backlog)$/;

// A unit-test citation names its file and its test's exact title, joined by
// ": " — the form the playbook specifies for what the simulator cannot see.
const UNIT_CITATION = /^(\S+\.mjs): (.+)$/s;

const backtickedTokens = [...principles.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const citedScenarios = new Set(backtickedTokens.filter((tok) => SCENARIO_TOKEN.test(tok)));
const citedUnitTests = backtickedTokens
  .map((tok) => tok.match(UNIT_CITATION))
  .filter(Boolean)
  .map((m) => ({ file: m[1], title: m[2] }));

const testTitles = (source) => [...source.matchAll(/test\((['"])((?:\\.|(?!\1).)*)\1/g)]
  .map((m) => m[2].replace(/\\(['"])/g, '$1'));

test('every scenario in scenarios.test.mjs is cited by at least one claim in PRINCIPLES.md', () => {
  const firstWords = testTitles(suite).map((t) => t.split(' ')[0]);
  assert.ok(firstWords.length > 60, `found ${firstWords.length} scenario titles`);
  assert.ok(citedScenarios.size > 60, `PRINCIPLES.md cites ${citedScenarios.size} scenario tokens`);
  for (const word of firstWords) {
    assert.ok(citedScenarios.has(word), `scenario "${word}" has no citing claim in PRINCIPLES.md`);
  }
});

test('every unit test PRINCIPLES.md cites exists with that exact title', () => {
  assert.ok(citedUnitTests.length > 40, `found ${citedUnitTests.length} unit-test citations`);
  const titlesByFile = new Map();
  for (const { file } of citedUnitTests) {
    if (titlesByFile.has(file)) continue;
    // Backtick code spans inside a title (e.g. carrying `Automerge:`) cannot be
    // written literally inside PRINCIPLES.md's own backtick-delimited citation,
    // so both sides are compared with backticks stripped.
    const stripped = testTitles(readFileSync(here(`../../${file}`), 'utf8')).map((t) => t.replaceAll('`', ''));
    titlesByFile.set(file, stripped);
  }
  for (const { file, title } of citedUnitTests) {
    assert.ok(titlesByFile.get(file).includes(title.replaceAll('`', '')),
      `PRINCIPLES.md cites "${file}: ${title}" but no test there has that title`);
  }
});
