import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeHostname, preflight, probeHostname } from '../../../tasks/site-release/preflight.mjs';

const answers = (records) => ({
  ok: true,
  json: async () => ({ Answer: records }),
});

// A resolver that answers per query type, so a case states what public DNS returns.
const resolver = (byType) => async (url) => {
  const type = new URL(url).searchParams.get('type');
  return answers(byType[type] ?? []);
};

test('an inherited CNAME on a claimed hostname is what blocks the attach', () => {
  const verdict = judgeHostname('www.example.com', { cname: ['owner.github.io'], a: [] });
  assert.match(verdict.what, /CNAME to owner\.github\.io/);
  assert.match(verdict.fix, /delete the www\.example\.com CNAME record/);
});

test("the old host's apex addresses are named as still-serving, not as blocking", () => {
  const verdict = judgeHostname('example.com', { cname: [], a: ['185.199.110.153'] });
  assert.match(verdict.what, /still resolves to GitHub Pages \(185\.199\.110\.153\)/);
  assert.match(verdict.fix, /visitors keep reaching the old host/);
});

// The steady state, and the one the release must not park on: a hostname Cloudflare
// already serves answers with its own addresses.
test('a hostname Cloudflare already serves is not a finding', () => {
  assert.equal(judgeHostname('example.com', { cname: [], a: ['104.21.0.1', '172.67.0.1'] }), null);
  assert.equal(judgeHostname('example.com', { cname: [], a: [] }), null);
});

test('a flattened CNAME answer is read as the address record it is', async () => {
  const answersFor = await probeHostname('example.com', resolver({
    CNAME: [{ type: 1, data: '104.21.0.1' }],
    A: [{ type: 1, data: '104.21.0.1' }],
  }));
  assert.deepEqual(answersFor, { cname: [], a: ['104.21.0.1', '104.21.0.1'] });
  assert.equal(judgeHostname('example.com', answersFor), null);
});

// An unreachable resolver is a statement about the probe, never a verdict on the
// hostname: a release that parked on it would stop for the network being down.
test('an unreachable resolver is inconclusive rather than a block', async () => {
  const dead = async () => { throw new Error('ENOTFOUND'); };
  assert.equal(await probeHostname('example.com', dead), null);
  const { blocked, unprobed } = await preflight(['example.com'], { fetchImpl: dead });
  assert.deepEqual(blocked, []);
  assert.deepEqual(unprobed, ['example.com']);
});

test('a resolver error status is inconclusive too', async () => {
  const refused = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const { blocked, unprobed } = await preflight(['example.com'], { fetchImpl: refused });
  assert.deepEqual(blocked, []);
  assert.deepEqual(unprobed, ['example.com']);
});

test('every claimed hostname is judged, not just the first', async () => {
  const byHost = {
    'example.com': { A: [{ type: 1, data: '185.199.108.153' }] },
    'www.example.com': { CNAME: [{ type: 5, data: 'owner.github.io.' }] },
  };
  const fetchImpl = async (url) => {
    const u = new URL(url);
    return resolver(byHost[u.searchParams.get('name')])(url);
  };
  const { blocked } = await preflight(['example.com', 'www.example.com'], { fetchImpl });
  assert.equal(blocked.length, 2);
  assert.match(blocked[0].what, /example\.com still resolves/);
  assert.match(blocked[1].what, /CNAME to owner\.github\.io/);
});
