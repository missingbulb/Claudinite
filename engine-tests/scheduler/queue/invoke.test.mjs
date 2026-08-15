import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEndpoint, agentInvoker, firePayload, DEFAULT_ENDPOINT, DEFAULT_HEADERS } from '../../../engine/scheduler/queue/invoke.mjs';

const CONFIG = {
  taskScheduler: {
    endpoints: {
      default: { url: 'https://example.invalid/routines/trig_1/fire', tokenSecret: 'CCR_TOKEN' },
      fleet: { url: 'https://example.invalid/routines/trig_2/fire', tokenSecret: 'CCR_FLEET_TOKEN' },
    },
  },
};
const task = (endpoint) => ({ pack: 'p', id: 't', decl: endpoint ? { invocation_endpoint: endpoint } : {} });
const item = { number: 42 };

test('a task with no declared endpoint rides the default one', () => {
  assert.equal(resolveEndpoint(CONFIG, task(null)).name, DEFAULT_ENDPOINT);
  assert.equal(resolveEndpoint(CONFIG, task(null)).url, 'https://example.invalid/routines/trig_1/fire');
});

// The whole of what replaced the fleet/self split: reach is a property of WHICH
// endpoint a task names, and the URL and credential stay in repo config.
test('a task needing wider reach names a different endpoint, and nothing else changes', () => {
  const e = resolveEndpoint(CONFIG, task('fleet'));
  assert.equal(e.url, 'https://example.invalid/routines/trig_2/fire');
  assert.equal(e.tokenEnv, 'CCR_FLEET_TOKEN');
});

test('an unconfigured endpoint is reported, never thrown or guessed at', () => {
  assert.match(resolveEndpoint(CONFIG, task('nowhere')).error, /declares no invocation endpoint "nowhere"/);
  assert.match(resolveEndpoint({}, task(null)).error, /declares no invocation endpoint "default"/);
  assert.match(resolveEndpoint({ taskScheduler: { endpoints: { default: { url: 'u' } } } }, task(null)).error, /tokenSecret/);
});

// The payload names an item and proves the call is the one the hand-off recorded
// — and carries no instructions, because the routine's stored prompt is what says
// how to act on it (routine-prompt.md). The field is freeform and unparsed, so
// prose is the only shape that survives the hop.
test('the fire payload names exactly one item and its nonce, and instructs nothing', () => {
  const p = firePayload({ repo: 'o/r', item, nonce: 'n-1' });
  assert.match(p, /o\/r#42/);
  assert.match(p, /nonce: n-1/i);
  assert.equal(typeof p, 'string');
});

test('a fired routine returns its session id, and the beta header rides every call', async () => {
  const seen = [];
  const invoke = agentInvoker({
    repo: 'o/r', config: CONFIG, env: { CCR_TOKEN: 'secret' },
    fetchImpl: async (url, opts) => {
      seen.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
      return { status: 200, json: async () => ({
        type: 'routine_fire',
        claude_code_session_id: 'session_01HJ',
        claude_code_session_url: 'https://claude.ai/code/session_01HJ',
      }) };
    },
  });
  const res = await invoke({ task: task(null), item, nonce: 'n-1' });
  assert.deepEqual(res, { ok: true, sessionId: 'session_01HJ', sessionUrl: 'https://claude.ai/code/session_01HJ' });
  assert.equal(seen[0].headers.authorization, 'Bearer secret');
  // The endpoint is a dated research preview; without its beta header the call is
  // rejected, and the response shape is the routine-fire one, not a session POST's.
  assert.equal(seen[0].headers['anthropic-beta'], DEFAULT_HEADERS['anthropic-beta']);
  assert.equal(seen[0].headers['anthropic-version'], DEFAULT_HEADERS['anthropic-version']);
  // ONE field, and it is `text`: the body is freeform and unparsed, so anything
  // structured would reach the routine as a literal string.
  assert.deepEqual(Object.keys(seen[0].body), ['text']);
});

// The beta header is dated and the preview keeps only the two most recent
// versions working, so rotating it must be a config edit on one repo — never an
// engine release the whole fleet waits for.
test('an endpoint may override the dated beta header without an engine change', async () => {
  const config = { taskScheduler: { endpoints: { default: {
    url: 'https://example.invalid/routines/trig_1/fire', tokenSecret: 'CCR_TOKEN',
    headers: { 'anthropic-beta': 'experimental-cc-routine-2027-01-01' },
  } } } };
  let sent = null;
  const invoke = agentInvoker({
    repo: 'o/r', config, env: { CCR_TOKEN: 't' },
    fetchImpl: async (url, opts) => { sent = opts.headers; return { status: 200, json: async () => ({}) }; },
  });
  await invoke({ task: task(null), item, nonce: 'n' });
  assert.equal(sent['anthropic-beta'], 'experimental-cc-routine-2027-01-01');
  assert.equal(sent['anthropic-version'], DEFAULT_HEADERS['anthropic-version'], 'an override replaces one header, not the set');
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
