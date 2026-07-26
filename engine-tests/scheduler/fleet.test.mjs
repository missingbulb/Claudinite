import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFleet, makeFleetGh } from '../../engine/scheduler/signals/fleet.mjs';

// A fake gh keyed by regex → response (the same seam signals.test.mjs uses).
const fakeGh = (routes) => async (path) => {
  for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
  return { status: 404, json: null };
};
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const checksFile = (obj) => ({ status: 200, json: { content: b64(obj) } });

const OWNER = 'acme';
const opts = (over = {}) => ({ owner: OWNER, canonRepo: 'acme/canon', sinceIso: '2026-07-21T00:00:00Z', ...over });

test('enumerates covered members, excluding the canon, forks and archived repos', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'canon', full_name: 'acme/canon', owner: { login: 'acme' }, default_branch: 'main' },
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
      { name: 'aFork', full_name: 'acme/aFork', owner: { login: 'acme' }, default_branch: 'main', fork: true },
      { name: 'old', full_name: 'acme/old', owner: { login: 'acme' }, default_branch: 'main', archived: true },
      { name: 'notmine', full_name: 'other/notmine', owner: { login: 'other' }, default_branch: 'main' },
    ] }],
    // app is a covered member; its declaration
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['basics', 'grow_with_claudinite'] })],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits/, { status: 200, json: [] }],
  ]);
  const fleet = await readFleet(gh, opts());
  assert.equal(fleet.error, undefined);
  assert.deepEqual(fleet.members.map((m) => m.repo), ['acme/app']); // canon/fork/archived/other excluded
  assert.deepEqual(fleet.members[0].activePacks, ['basics', 'grow_with_claudinite']);
});

test('an uncovered repo (no declaration file) is not a member', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
      { name: 'bare', full_name: 'acme/bare', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['basics'] })],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits/, { status: 200, json: [] }],
    [/\/repos\/acme\/bare\/contents\/\.claudinite-checks\.json/, { status: 404, json: null }],
  ]);
  const fleet = await readFleet(gh, opts());
  assert.deepEqual(fleet.members.map((m) => m.repo), ['acme/app']);
});

test('reads pack configs, the scheduler marker, and the provenance stamp', async () => {
  const decl = {
    packs: ['basics', { id: 'grow_with_claudinite', config: { promote: false } }],
    taskScheduler: { dailyHour: 4 },
    claudinite: { updated: '2026-07-10T00:00:00Z', ref: 'abc123' },
  };
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile(decl)],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits/, { status: 200, json: [] }],
  ]);
  const [m] = (await readFleet(gh, opts())).members;
  assert.deepEqual(m.activePacks, ['basics', 'grow_with_claudinite']); // bare ids, both forms
  assert.deepEqual(m.packConfigs.grow_with_claudinite, { promote: false });
  assert.equal(m.schedulesItself, true);
  assert.deepEqual(m.stamp, { updated: '2026-07-10T00:00:00Z', ref: 'abc123' });
});

test('localPacksChanged fires when a window commit touched a local-pack root (either root)', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['grow_with_claudinite'] })],
    // has a local pack dir under the canonical root
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local\/packs$/, { status: 200, json: [{ type: 'dir', name: 'app' }] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local_packs$/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits\?/, { status: 200, json: [{ sha: 'c1' }] }],
    [/\/repos\/acme\/app\/commits\/c1$/, { status: 200, json: { files: [{ filename: '.claudinite/local/packs/app/RULES.md' }] } }],
  ]);
  const [m] = (await readFleet(gh, opts())).members;
  assert.equal(m.hasLocalPacks, true);
  assert.equal(m.localPacksChanged, true);
});

test('localPacksChanged stays false when the window touched only product code', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['grow_with_claudinite'] })],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local\/packs$/, { status: 200, json: [{ type: 'dir', name: 'app' }] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local_packs$/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits\?/, { status: 200, json: [{ sha: 'c1' }] }],
    [/\/repos\/acme\/app\/commits\/c1$/, { status: 200, json: { files: [{ filename: 'src/app.js' }] } }],
  ]);
  const [m] = (await readFleet(gh, opts())).members;
  assert.equal(m.localPacksChanged, false);
});

test('an empty enumeration is an error, never consent to an empty fleet', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'x', full_name: 'other/x', owner: { login: 'other' }, default_branch: 'main' },
    ] }],
  ]);
  const fleet = await readFleet(gh, opts());
  assert.deepEqual(fleet.members, []);
  assert.match(fleet.error, /no repos owned by acme/);
});

test('makeFleetGh returns null without the token, a reader with it', () => {
  assert.equal(makeFleetGh({}), null);
  assert.equal(typeof makeFleetGh({ FLEET_GITHUB_TOKEN: 't' }), 'function');
});
