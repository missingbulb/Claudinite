import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterFrom, loadConfig, loadRoster, DEFAULTS } from '../../../engine/scheduler/dashboard/config.mjs';
import { isOAuthConfigured } from '../../../engine/scheduler/dashboard/auth.mjs';

// The roster's source is a fleet artifact this page does not own, so it accepts the
// shapes such an artifact plausibly has rather than dictating one.
test('rosterFrom reads a keyed fleet artifact, a plain array, and a repos array', () => {
  assert.deepEqual(rosterFrom({ repos: { 'o/a': {}, 'o/b': {} } }), ['o/a', 'o/b']);
  assert.deepEqual(rosterFrom(['o/a', 'o/b']), ['o/a', 'o/b']);
  assert.deepEqual(rosterFrom({ repos: ['o/a'] }), ['o/a']);
});

test('rosterFrom yields nothing for a shape it does not recognise', () => {
  for (const doc of [null, undefined, 42, {}, { members: ['o/a'] }]) {
    assert.deepEqual(rosterFrom(doc), [], `unexpected roster from ${JSON.stringify(doc)}`);
  }
});

test('rosterFrom drops non-string entries rather than rendering them', () => {
  assert.deepEqual(rosterFrom(['o/a', null, 7, 'o/b']), ['o/a', 'o/b']);
});

// Absent config is a valid deployment (a member repo, served locally), so every miss
// has to be a default rather than an error — a throw here would be a blank page.
test('a missing or broken config file yields the defaults', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.deepEqual(await loadConfig('./nope.json'), DEFAULTS);

  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadConfig('./nope.json'), DEFAULTS);

  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('not json'); } });
  assert.deepEqual(await loadConfig('./bad.json'), DEFAULTS);
});

test('a config file is merged over the defaults', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ clientId: 'Iv1.x', defaultRepo: 'o/a' }) });
  const c = await loadConfig();
  assert.equal(c.clientId, 'Iv1.x');
  assert.equal(c.defaultRepo, 'o/a');
  assert.equal(c.exchangeUrl, null, 'unset keys keep their default');
});

test('an inline repos list wins over a roster url, and neither is required', async () => {
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return { ok: true, json: async () => ['o/z'] }; };

  assert.deepEqual(await loadRoster({ repos: ['o/a'], rosterUrl: './r.json' }), ['o/a']);
  assert.equal(fetched, false, 'an inline list means no fetch at all');

  assert.deepEqual(await loadRoster({ repos: [], rosterUrl: './r.json' }), ['o/z']);
  assert.deepEqual(await loadRoster({ repos: [] }), []);
});

test('an unreachable roster is empty, not an error', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadRoster({ rosterUrl: './r.json' }), []);
});

// Sign-in needs BOTH halves: a client id with nowhere to exchange the code would
// render a button that always fails.
test('OAuth counts as configured only with both a client id and an exchange url', () => {
  assert.equal(isOAuthConfigured({ clientId: 'a', exchangeUrl: 'https://x' }), true);
  assert.equal(isOAuthConfigured({ clientId: 'a' }), false);
  assert.equal(isOAuthConfigured({ exchangeUrl: 'https://x' }), false);
  assert.equal(isOAuthConfigured(null), false);
});
