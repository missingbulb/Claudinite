import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFleet, makeFleetGh } from '../signals/fleet.mjs';

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
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['basics', 'claudinite-growth'] })],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits/, { status: 200, json: [] }],
  ]);
  const fleet = await readFleet(gh, opts());
  assert.equal(fleet.error, undefined);
  assert.deepEqual(fleet.members.map((m) => m.repo), ['acme/app']); // canon/fork/archived/other excluded
  assert.deepEqual(fleet.members[0].activePacks, ['basics', 'claudinite-growth']);
});

// Dormancy is the member's own declaration that it is out of the RECURRING work,
// and this signal exists for nothing else: it feeds the fleet tasks' preconditions.
// A dormant member enumerated here is an opus sweep spent on a repo that asked to
// be left alone — and the per-member probes below it are API reads spent the same
// way, which is why the skip sits beside the fork/archived ones rather than in each
// consuming precondition.
test('a declared-dormant member is not enumerated', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
      { name: 'asleep', full_name: 'acme/asleep', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['basics'] })],
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, { status: 404, json: null }],
    [/\/repos\/acme\/app\/commits/, { status: 200, json: [] }],
    [/\/repos\/acme\/asleep\/contents\/\.claudinite/, checksFile({ packs: ['basics', 'claudinite-growth'], dormant: true })],
    // Anything past the declaration read is a probe this member must never pay for.
    [/\/repos\/acme\/asleep\//, () => { throw new Error('a dormant member must not be probed past its declaration'); }],
  ]);
  const fleet = await readFleet(gh, opts());
  assert.deepEqual(fleet.members.map((m) => m.repo), ['acme/app']);
});

// `dormant` is a BOOLEAN in the declaration's own schema, and the engine's
// isDormant is the one test — a truthy string or an object left in its place is a
// malformed declaration, not consent to stop sweeping this member.
test('only a literal true is dormant — a truthy stand-in still enumerates', async () => {
  for (const dormant of [false, 'true', { since: '2026-01-01' }, 1]) {
    const gh = fakeGh([
      [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
        { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
      ] }],
      [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['basics'], dormant })],
      [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, { status: 404, json: null }],
      [/\/repos\/acme\/app\/commits/, { status: 200, json: [] }],
    ]);
    const fleet = await readFleet(gh, opts());
    assert.deepEqual(fleet.members.map((m) => m.repo), ['acme/app'], `dormant: ${JSON.stringify(dormant)}`);
  }
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
    packs: ['basics', { id: 'claudinite-growth', config: { promote: false } }],
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
  assert.deepEqual(m.activePacks, ['basics', 'claudinite-growth']); // bare ids, both forms
  assert.deepEqual(m.packConfigs['claudinite-growth'], { promote: false });
  assert.equal(m.schedulesItself, true);
  assert.deepEqual(m.stamp, { updated: '2026-07-10T00:00:00Z', ref: 'abc123' });
});

test('localPacksChanged fires when a window commit touched a local-pack root (either root)', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['claudinite-growth'] })],
    // Nothing probes whether the member HAS local packs — a `contents` read here
    // would be the cost this reader stopped paying, so the route throws.
    [/\/repos\/acme\/app\/contents\/\.claudinite\/local/, () => { throw new Error('local-pack presence must not be probed'); }],
    [/\/repos\/acme\/app\/commits\?/, { status: 200, json: [{ sha: 'c1' }] }],
    [/\/repos\/acme\/app\/commits\/c1$/, { status: 200, json: { files: [{ filename: '.claudinite/local/packs/app/RULES.md' }] } }],
  ]);
  const [m] = (await readFleet(gh, opts())).members;
  assert.equal(m.localPacksChanged, true);
  assert.equal('hasLocalPacks' in m, false, 'the field is gone, not merely true');
});

test('localPacksChanged stays false when the window touched only product code', async () => {
  const gh = fakeGh([
    [/\/user\/repos\?affiliation=owner/, { status: 200, json: [
      { name: 'app', full_name: 'acme/app', owner: { login: 'acme' }, default_branch: 'main' },
    ] }],
    [/\/repos\/acme\/app\/contents\/\.claudinite-checks\.json/, checksFile({ packs: ['claudinite-growth'] })],
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
