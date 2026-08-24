import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEndpoint, agentInvoker, firePayload, DEFAULT_ENDPOINT, DEFAULT_HEADERS } from '../../queue/invoke.mjs';

// Spelled the CURRENT way (#1252) — the map says which endpoints these are.
const CONFIG = {
  taskScheduler: {
    agenticTaskInvocationEndpoints: {
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

// The rename's window: a member writes its own settings, so the retired spelling is
// live until that member's own converge rewrites it, and a resolver that only knew
// the current one would fail every hand-off on every repo that has not converged.
test('the retired "endpoints" spelling still resolves', () => {
  const legacy = { taskScheduler: { endpoints: CONFIG.taskScheduler.agenticTaskInvocationEndpoints } };
  assert.equal(resolveEndpoint(legacy, task('fleet')).url, 'https://example.invalid/routines/trig_2/fire');
});

test('an unconfigured endpoint is reported, never thrown or guessed at', () => {
  assert.match(resolveEndpoint(CONFIG, task('nowhere')).error, /declare no invocation endpoint "nowhere"/);
  assert.match(resolveEndpoint({}, task(null)).error, /declare no invocation endpoint "default"/);
  assert.match(resolveEndpoint({ taskScheduler: { endpoints: { default: { url: 'u' } } } }, task(null)).error, /tokenSecret/);
});

// The payload names an item and proves the call is the one the hand-off recorded
// — and carries no instructions, because the routine's stored prompt is what says
// how to act on it (instructions.md). The field is freeform and unparsed, so
// prose is the only shape that survives the hop.
test('the fire payload names exactly one item and its nonce, and instructs nothing', () => {
  const p = firePayload({ repo: 'o/r', item, nonce: 'n-1' });
  assert.match(p, /o\/r#42/);
  assert.match(p, /nonce: n-1/i);
  assert.equal(typeof p, 'string');
});

test('a fired routine returns its session id, and the beta header rides the call', async () => {
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

// THE PROPERTY THE WHOLE DESIGN TURNS ON: one call per item, ever. A retry is
// only safe when you know the first call did nothing, and the endpoint offers no
// idempotency key — so a second call is how two sessions land on one item, which
// is precisely what the deleted agent-side claim protocol existed to clean up.
test('the endpoint is called exactly once — no status is ever retried', async () => {
  for (const status of [422, 401, 500, 503]) {
    let calls = 0;
    const invoke = agentInvoker({
      repo: 'o/r', config: CONFIG, env: { CCR_TOKEN: 't' },
      fetchImpl: async () => { calls += 1; return { status, json: async () => ({}) }; },
    });
    const res = await invoke({ task: task(null), item, nonce: 'n' });
    assert.equal(calls, 1, `status ${status} must not be retried`);
    assert.equal(res.ok, false);
    assert.equal(res.answered, true, 'a status came back, so no session was started');
  }
});

// The one outcome that must never be reported as a plain failure: the call may
// have started a session. Answering "unknown" is what lets the caller leave the
// item with the agent instead of re-queueing it into a duplicate.
test('a call that gets no answer is UNKNOWN, not failed, and is not retried', async () => {
  let calls = 0;
  const invoke = agentInvoker({
    repo: 'o/r', config: CONFIG, env: { CCR_TOKEN: 't' },
    fetchImpl: async () => { calls += 1; throw new Error('socket timeout'); },
  });
  const res = await invoke({ task: task(null), item, nonce: 'n' });
  assert.equal(calls, 1);
  assert.equal(res.ok, false);
  assert.equal(res.answered, false);
  assert.match(res.error, /socket timeout/);
});

test('a configuration fault is answered-and-definite: nothing was fired', async () => {
  const noToken = agentInvoker({ repo: 'o/r', config: CONFIG, env: {}, fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal((await noToken({ task: task(null), item, nonce: 'n' })).answered, true);
  const noEndpoint = agentInvoker({ repo: 'o/r', config: {}, env: {}, fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal((await noEndpoint({ task: task(null), item, nonce: 'n' })).answered, true);
});

// #1301. The endpoint token rides the bag like every other secret, and a member
// still running a stamping executor workflow keeps resolving it the old way.
test('the endpoint token is read from the secrets bag', async () => {
  let sent = null;
  const invoke = agentInvoker({
    repo: 'o/r', config: CONFIG,
    env: { CLAUDINITE_SECRETS: JSON.stringify({ CCR_TOKEN: 'bagged' }) },
    fetchImpl: async (_url, init) => { sent = init.headers.authorization; return { ok: true, status: 200, text: async () => '{}' }; },
  });
  assert.equal((await invoke({ task: task(null), item, nonce: 'n' })).ok, true);
  assert.match(sent, /bagged/);
});

// #1296: the message asserted a cause the code cannot see. The secret was set the
// whole time; the workflow never passed it, and the reader went to the Secrets page
// and had nowhere to go next.
test('a missing endpoint token names BOTH causes, not just the one the code cannot rule out', async () => {
  const invoke = agentInvoker({ repo: 'o/r', config: CONFIG, env: {}, fetchImpl: async () => { throw new Error('must not be called'); } });
  const { error } = await invoke({ task: task(null), item, nonce: 'n-1' });
  assert.match(error, /`CCR_TOKEN`/);
  assert.match(error, /pending-workflows/, 'the undelivered executor workflow is the usual cause and must be named');
  assert.doesNotMatch(error, /is not set in this repo/, 'that asserts a cause this code cannot observe');
});
