import { test } from 'node:test';
import assert from 'node:assert/strict';
import pack from './pack.mjs';
import storeRelease from './maintenance/store-release.mjs';

const REPO = { fullName: 'owner/ext', defaultBranch: 'main' };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
function fakeGh(routes) {
  return async (path) => {
    for (const [re, resp] of routes) if (re.test(path)) return typeof resp === 'function' ? resp(path) : resp;
    return { status: 404, json: null };
  };
}

test('chrome-extension-release declares chrome-store-release as a pack task (smarts none)', () => {
  assert.deepEqual((pack.maintenance ?? []).map((t) => t.id), ['chrome-store-release']);
  assert.equal(storeRelease.smarts, 'none');
});

test('gate: runs when the manifest version is ahead of the latest release', async () => {
  const gh = fakeGh([
    [/\/contents\/manifest\.json/, { status: 200, json: { content: b64({ version: '1.4.0' }) } }],
    [/\/releases\/latest/, { status: 200, json: { tag_name: 'v1.3.0' } }],
  ]);
  const v = await storeRelease.gate(REPO, {}, gh);
  assert.equal(v.run, true);
  assert.equal(v.targets.unreleasedVersion, '1.4.0');
  assert.equal(v.targets.lastReleased, '1.3.0');
});

test('gate: silent when the shipped version equals the latest release', async () => {
  const gh = fakeGh([
    [/\/contents\/manifest\.json/, { status: 200, json: { content: b64({ version: '2.0.0' }) } }],
    [/\/releases\/latest/, { status: 200, json: { tag_name: 'v2.0.0' } }],
  ]);
  assert.equal((await storeRelease.gate(REPO, {}, gh)).run, false);
});

test('gate: runs when there is no release yet but a manifest version exists', async () => {
  const gh = fakeGh([
    [/\/contents\/src\/manifest\.json/, { status: 200, json: { content: b64({ version: '0.1.0' }) } }],
    [/\/releases\/latest/, { status: 404, json: null }],
  ]);
  const v = await storeRelease.gate(REPO, {}, gh);
  assert.equal(v.run, true);
  assert.equal(v.targets.lastReleased, null);
});

test('gate: silent when no manifest version can be found', async () => {
  const gh = fakeGh([[/./, { status: 404, json: null }]]);
  assert.equal((await storeRelease.gate(REPO, {}, gh)).run, false);
});
