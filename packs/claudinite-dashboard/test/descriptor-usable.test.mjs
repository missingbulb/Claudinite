import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import rule from '../worldRules/descriptor-usable.mjs';

// A context over an in-memory tree. `allFiles` is what the real runner hands a rule,
// so a fixture is a path→text map and nothing here touches disk.
const ctx = (files) => ({ allFiles: Object.keys(files), read: (f) => files[f] ?? null });
const ids = (out) => out.map((f) => f.what);

const ok = JSON.stringify({
  widgets: [{ id: 'stars', kind: 'stat', label: 'stars', noun: 'stars', source: 'repo-stars' }],
  repo: ['stars'], fleet: { member: 'stars' },
});

test('a usable descriptor is silent, in the canon and in a local pack', () => {
  assert.deepEqual(rule.run(ctx({ 'packs/git-github/dashboard.json': ok })), []);
  assert.deepEqual(rule.run(ctx({ '.claudinite/local/packs/mine/dashboard.json': ok })), []);
});

// The vendored mount is read-only to a member: a canon descriptor's fault is the
// canon's to fix, and blocking a member on it would leave them nothing to do.
test('a descriptor in the vendored mount is not the member\'s to police', () => {
  assert.deepEqual(rule.run(ctx({ '.claudinite/shared/packs/git-github/dashboard.json': '{ broken' })), []);
});

test('a file that is not a pack descriptor is not scanned', () => {
  assert.deepEqual(rule.run(ctx({ 'packs/x/dashboard.json.bak': '{ broken', 'dashboard.json': '{ broken' })), []);
});

test('a descriptor the reader rejects is a finding naming why', () => {
  const out = rule.run(ctx({ 'packs/p/dashboard.json': '{ broken' }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /not valid JSON/);
});

// The reader drops an unresolvable id deliberately — a member may run a shorter pack
// version — so the canon, where descriptor and widgets are one file, is the only place
// a typo can be told from that.
test('a view selecting a widget the descriptor does not declare is caught', () => {
  const out = rule.run(ctx({ 'packs/p/dashboard.json': JSON.stringify({
    widgets: [{ id: 'a', kind: 'stat', label: 'a', noun: 'a' }], repo: ['a', 'ghost'], fleet: { member: 'a' },
  }) }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /ghost/);
});

test('a list named as the fleet mini-card is caught', () => {
  const out = rule.run(ctx({ 'packs/p/dashboard.json': JSON.stringify({
    widgets: [{ id: 'r', kind: 'list', label: 'r' }], fleet: { member: 'r' },
  }) }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /cannot be one line/);
});

// A bare number in a column of bare numbers says nothing about what it counts.
test('a fleet mini-card with no noun is caught', () => {
  const out = rule.run(ctx({ 'packs/p/dashboard.json': JSON.stringify({
    widgets: [{ id: 'a', kind: 'stat', label: 'a' }], fleet: { member: 'a' },
  }) }));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /bare number/);
});

// PROVED AGAINST THE REAL TREE, not only against a clean fixture: a fixture spells the
// same gap the check has, so only the repo's own sources can disagree with it. And the
// scope must be non-empty — a pattern left behind by a layout change matches nothing,
// reads as live, and catches nothing.
test('the check is silent on the real corpus, and its scope is not empty', () => {
  const root = new URL('../../..', import.meta.url).pathname;
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: root }).split('\n').filter(Boolean);

  // A pattern left behind by a layout change matches nothing, reads as live, and
  // catches nothing — so assert the scope before asserting the silence.
  const descriptors = files.filter((f) => /^packs\/[^/]+\/dashboard\.json$/.test(f));
  assert.ok(descriptors.length > 0, 'no pack descriptor is tracked — the check would match nothing and read as live');

  const real = { allFiles: files, read: (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return null; } } };
  assert.deepEqual(rule.run(real), []);
});
