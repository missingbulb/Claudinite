import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rosterFrom, loadConfig, loadRoster, DEFAULTS, isFleetConfig, inFleet, resolveRoster, resolveMode,
} from '../config.mjs';
import { isOAuthConfigured } from '../auth.mjs';

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

// --- the roster ------------------------------------------------------------------

// A fleet deployment names an OWNER and the page enumerates as the viewer, so what the
// fleet contains is decided at read time by what this person can see. These are the
// rules that decision follows.

test('the deployment STATES which page it is — the roster source no longer implies it', () => {
  assert.equal(isFleetConfig({ mode: 'fleet', owner: 'missingbulb' }), true);
  assert.equal(isFleetConfig({ mode: 'repo' }), false);
  // The shapes that used to MEAN fleet no longer do on their own. This is the whole
  // point of the key: a fleet deployment whose roster source went missing must not
  // quietly re-read as a repo page, and it cannot, because the mode is not derived
  // from the roster at all.
  assert.equal(isFleetConfig({ owner: 'missingbulb' }), false);
  assert.equal(isFleetConfig({ rosterUrl: './roster.json' }), false);
  assert.equal(isFleetConfig({ repos: ['o/a', 'o/b'] }), false);
  assert.equal(isFleetConfig({}), false);
  assert.equal(isFleetConfig(null), false);
});

// --- the mode, which has no default ----------------------------------------------

// The build refuses to publish a site whose declaration did not say which dashboard it
// is. Silence used to mean "repo", which is exactly the default the owner ruled out:
// a fleet deployment that lost its roster source published as a one-repo page and
// looked intentional. `resolveMode` is where that judgment lives, so the page and the
// build agree by construction rather than by two matching expressions.

test('a declaration that states no mode is refused, not defaulted', () => {
  assert.throws(() => resolveMode({}), /no default/);
  assert.throws(() => resolveMode({ owner: 'missingbulb' }), /no default/);
  assert.throws(() => resolveMode(null), /no default/);
});

test('a mode outside the vocabulary names the two that exist', () => {
  assert.throws(() => resolveMode({ mode: 'single' }), /"repo".*"fleet"|"fleet".*"repo"/s);
  assert.throws(() => resolveMode({ mode: 'FLEET' }), /single|unknown|not a mode|"repo"/i);
});

test('a stated mode that contradicts the config is refused in BOTH directions', () => {
  // The two halves of the same guard. Either alone leaves a way to publish the wrong
  // page: without the first, `mode: fleet` with no roster silently covers one repo;
  // without the second, `mode: repo` beside an owner silently ignores the owner.
  assert.throws(() => resolveMode({ mode: 'fleet' }), /names no roster source/);
  assert.throws(() => resolveMode({ mode: 'repo', owner: 'missingbulb' }), /roster source/);
  assert.throws(() => resolveMode({ mode: 'repo', rosterUrl: './r.json' }), /roster source/);
  assert.throws(() => resolveMode({ mode: 'repo', repos: ['o/a', 'o/b'] }), /roster source/);
});

test('the agreeing shapes pass, and a rosterFile counts as a roster source', () => {
  assert.equal(resolveMode({ mode: 'fleet', owner: 'missingbulb' }), 'fleet');
  assert.equal(resolveMode({ mode: 'fleet', rosterUrl: './r.json' }), 'fleet');
  assert.equal(resolveMode({ mode: 'fleet', repos: ['o/a', 'o/b'] }), 'fleet');
  // The build reads `rosterFile` (a path in the repo) where the page reads `rosterUrl`;
  // both are roster sources and the guard has to know it, or Shepherd's legacy
  // declaration reads as a fleet mode naming nothing.
  assert.equal(resolveMode({ mode: 'fleet', rosterFile: 'usage-fleet.GENERATED.json' }), 'fleet');
  assert.equal(resolveMode({ mode: 'repo' }), 'repo');
  // A single-entry `repos` is not a roster: it is this repo, named.
  assert.equal(resolveMode({ mode: 'repo', repos: ['o/a'] }), 'repo');
});

test('DEFAULTS carries no mode — there is nothing for silence to fall back to', () => {
  assert.equal(DEFAULTS.mode, null);
  assert.ok(!isFleetConfig(DEFAULTS));
});

test('archived and forked repos leave the fleet by their own state, not by a list', () => {
    const repo = (full_name, over = {}) => ({ full_name, archived: false, fork: false, ...over });
  assert.equal(inFleet(repo('o/a')), true);
  assert.equal(inFleet(repo('o/a', { archived: true })), false);
  assert.equal(inFleet(repo('o/a', { fork: true })), false);
  // `exclude` takes either spelling, because a member writes whichever reads naturally
  // in its own declaration.
  assert.equal(inFleet(repo('o/a'), ['o/a']), false);
  assert.equal(inFleet(repo('o/a'), ['a']), false);
  assert.equal(inFleet(repo('o/a'), ['b']), true);
});

test('resolveRoster enumerates the owner, sorted, and says how far it got', async () => {
    const gh = {
    listOwnerRepos: async () => ({
      repos: [
        { full_name: 'o/zeta', archived: false, fork: false },
        { full_name: 'o/alpha', archived: false, fork: false },
        { full_name: 'o/old', archived: true, fork: false },
        { full_name: 'o/skip', archived: false, fork: false },
      ],
      complete: true,
    }),
  };
  const out = await resolveRoster({ owner: 'o', exclude: ['o/skip'] }, 't', gh);
  assert.deepEqual(out.repos, ['o/alpha', 'o/zeta']);
  assert.equal(out.source, 'owner');
  assert.equal(out.complete, true);
});

test('a stated roster wins over enumeration, and a failed enumeration is not an empty fleet', async () => {
    const gh = { listOwnerRepos: async () => { throw new Error('403'); } };
  const stated = await resolveRoster({ owner: 'o', repos: ['o/a', 'o/b'] }, 't', gh);
  assert.deepEqual(stated.repos, ['o/a', 'o/b']);
  assert.equal(stated.source, 'configured');

  const failed = await resolveRoster({ owner: 'o' }, 't', gh);
  assert.deepEqual(failed.repos, []);
  // `complete: false` plus the error is what makes the page say the list could not be
  // read rather than render a fleet that happens to have nobody in it.
  assert.equal(failed.complete, false);
  assert.ok(failed.error);
});
