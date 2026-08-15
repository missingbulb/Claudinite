import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEndpoint, agentInvoker, invocationPrompt, DEFAULT_ENDPOINT } from '../../../engine/scheduler/queue/invoke.mjs';

const CONFIG = {
  taskScheduler: {
    endpoints: {
      default: { url: 'https://example.invalid/sessions', tokenSecret: 'CCR_TOKEN' },
      fleet: { url: 'https://example.invalid/fleet-sessions', tokenSecret: 'CCR_FLEET_TOKEN' },
    },
  },
};
const task = (endpoint) => ({ pack: 'p', id: 't', decl: endpoint ? { invocation_endpoint: endpoint } : {} });
const item = { number: 42 };

test('a task with no declared endpoint rides the default one', () => {
  assert.equal(resolveEndpoint(CONFIG, task(null)).name, DEFAULT_ENDPOINT);
  assert.equal(resolveEndpoint(CONFIG, task(null)).url, 'https://example.invalid/sessions');
});

// The whole of what replaced the fleet/self split: reach is a property of WHICH
// endpoint a task names, and the URL and credential stay in repo config.
test('a task needing wider reach names a different endpoint, and nothing else changes', () => {
  const e = resolveEndpoint(CONFIG, task('fleet'));
  assert.equal(e.url, 'https://example.invalid/fleet-sessions');
  assert.equal(e.tokenEnv, 'CCR_FLEET_TOKEN');
});

test('an unconfigured endpoint is reported, never thrown or guessed at', () => {
  assert.match(resolveEndpoint(CONFIG, task('nowhere')).error, /declares no invocation endpoint "nowhere"/);
  assert.match(resolveEndpoint({}, task(null)).error, /declares no invocation endpoint "default"/);
  assert.match(resolveEndpoint({ taskScheduler: { endpoints: { default: { url: 'u' } } } }, task(null)).error, /tokenSecret/);
});

test('the prompt names exactly one item and its nonce, and carries no instructions', () => {
  const p = invocationPrompt({ repo: 'o/r', item, nonce: 'n-1' });
  assert.match(p, /work item #42 in o\/r/);
  assert.match(p, /Invocation nonce: n-1/);
  assert.match(p, /validate it in code/);
});

test('a successful call returns the session id, with the nonce as the idempotency key', async () => {
  const seen = [];
  const invoke = agentInvoker({
    repo: 'o/r', config: CONFIG, env: { CCR_TOKEN: 'secret' },
    fetchImpl: async (url, opts) => {
      seen.push({ url, body: JSON.parse(opts.body), auth: opts.headers.authorization });
      return { status: 201, json: async () => ({ id: 'sess-1' }) };
    },
  });
  const res = await invoke({ task: task(null), item, nonce: 'n-1' });
  assert.deepEqual(res, { ok: true, sessionId: 'sess-1' });
  assert.equal(seen[0].auth, 'Bearer secret');
  assert.equal(seen[0].body.idempotency_key, 'n-1');
});

test('a missing endpoint token names the secret to set rather than failing silently', async () => {
  const invoke = agentInvoker({ repo: 'o/r', config: CONFIG, env: {}, fetchImpl: async () => { throw new Error('must not be called'); } });
  const res = await invoke({ task: task(null), item, nonce: 'n-1' });
  assert.equal(res.ok, false);
  assert.match(res.error, /`CCR_TOKEN`/);
});

// A 4xx is a decision, not a blip: retrying it buys nothing and doubles the
// chance that a call which DID create a session creates a second.
test('a 4xx is not retried; a 5xx is', async () => {
  let calls = 0;
  const withStatus = (status) => agentInvoker({
    repo: 'o/r', config: CONFIG, env: { CCR_TOKEN: 't' }, attempts: 3,
    fetchImpl: async () => { calls += 1; return { status, json: async () => ({}) }; },
  });
  await withStatus(422)({ task: task(null), item, nonce: 'n' });
  assert.equal(calls, 1);
  calls = 0;
  const res = await withStatus(503)({ task: task(null), item, nonce: 'n' });
  assert.equal(calls, 3);
  assert.match(res.error, /503/);
});

test('a call that throws is data, not an exception — the caller decides what it costs', async () => {
  const invoke = agentInvoker({
    repo: 'o/r', config: CONFIG, env: { CCR_TOKEN: 't' }, attempts: 1,
    fetchImpl: async () => { throw new Error('socket timeout'); },
  });
  const res = await invoke({ task: task(null), item, nonce: 'n' });
  assert.equal(res.ok, false);
  assert.match(res.error, /socket timeout/);
});
