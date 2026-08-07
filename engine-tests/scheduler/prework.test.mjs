import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { runPrework, preworkFailure, agentRequestPath, clearAgentRequest, agentRequested, readAgentRequest } from '../../engine/scheduler/prework.mjs';

const NODE = process.execPath; // the running node, so the tests don't assume PATH

test('runPrework: a clean exit is ok', async () => {
  const r = await runPrework(`"${NODE}" -e "process.exit(0)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 0);
});

test('runPrework: a non-zero exit is a failure carrying the code', async () => {
  const r = await runPrework(`"${NODE}" -e "process.exit(3)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 3);
});

test('runPrework: an overrun is hard-killed and reported timedOut', async () => {
  const r = await runPrework(`"${NODE}" -e "setTimeout(()=>{}, 10000)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 0.3 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.notEqual(r.signal, null); // killed by signal, not a clean exit
});

test('runPrework: the child inherits the injected env', async () => {
  const cmd = `"${NODE}" -e "process.exit(process.env.CLAUDINITE_SLOT_ID === 'd2026' ? 0 : 1)"`;
  const r = await runPrework(cmd, { taskDir: process.cwd(), env: { ...process.env, CLAUDINITE_SLOT_ID: 'd2026' }, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
});

test('runPrework: a command that cannot start is a failure, not a throw', async () => {
  const r = await runPrework('definitely-not-a-real-command-xyz', { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
});

// The worker's own output is the scheduler's only account of what preprocessing did.
// Before it was echoed, a failed worker read as a bare `preprocessing exited 1` and
// diagnosing one meant reproducing it by hand.

test('runPrework: the child output is echoed as it arrives, tagged by stream', async () => {
  const seen = [];
  const cmd = `"${NODE}" -e "process.stdout.write('converging\\n'); process.stderr.write('rejected\\n')"`;
  const r = await runPrework(cmd, {
    taskDir: process.cwd(), env: process.env, timeoutSeconds: 10,
    echo: (chunk, stream) => seen.push([stream, chunk]),
  });
  assert.equal(r.ok, true);
  assert.deepEqual(seen.filter(([s]) => s === 'stdout').map(([, c]) => c), ['converging\n']);
  assert.deepEqual(seen.filter(([s]) => s === 'stderr').map(([, c]) => c), ['rejected\n']);
  // Still collected as well — the failure summary and the needs-human issue read these.
  assert.equal(r.stdout, 'converging\n');
  assert.equal(r.stderr, 'rejected\n');
});

test('runPrework: a worker killed at its timeout still echoed what it printed first', async () => {
  const seen = [];
  const cmd = `"${NODE}" -e "process.stdout.write('got this far\\n'); setTimeout(()=>{}, 10000)"`;
  const r = await runPrework(cmd, {
    taskDir: process.cwd(), env: process.env, timeoutSeconds: 0.5,
    echo: (chunk) => seen.push(chunk),
  });
  assert.equal(r.timedOut, true);
  // This is the whole reason the echo is live rather than a dump at exit: the buffer
  // of a SIGKILLed child is exactly the output nobody would otherwise ever see.
  assert.deepEqual(seen, ['got this far\n']);
});

test('runPrework: a broken echo sink never fails the run', async () => {
  const r = await runPrework(`"${NODE}" -e "console.log('hi')"`, {
    taskDir: process.cwd(),
    env: process.env,
    timeoutSeconds: 10,
    echo: () => { throw new Error('sink is gone'); },
  });
  assert.equal(r.ok, true);       // the run's verdict is the child's, never the log's
  assert.equal(r.stdout, 'hi\n'); // and the collection is unaffected
});

test('preworkFailure: distinguishes a timeout from a non-zero exit', () => {
  assert.match(preworkFailure({ timedOut: true, code: null, stderr: '' }), /exceeded its prework_timeout/);
  assert.match(preworkFailure({ timedOut: false, code: 2, stderr: '' }), /exited 2/);
  assert.match(preworkFailure({ timedOut: false, code: null, stderr: 'boom\n' }), /could not run: boom/);
});

test('agentRequestPath is deterministic per (pack, task, slot)', () => {
  const rec = { pack: 'basics', task: 'baselining', slotId: 'd2026-07-23' };
  assert.equal(agentRequestPath(rec), agentRequestPath({ ...rec }));
  assert.notEqual(agentRequestPath(rec), agentRequestPath({ ...rec, slotId: 'd2026-07-24' }));
  assert.match(agentRequestPath(rec), /claudinite-request-agent-basics-baselining-d2026-07-23$/);
});

test('the request signal round-trips: written → requested, cleared → not (clearing an absent path is a no-op)', () => {
  const path = agentRequestPath({ pack: 'p', task: 't', slotId: 's-signal-test' });
  clearAgentRequest(path);                       // clean slate (no throw when absent)
  assert.equal(agentRequested(path), false);     // absent → not requested
  writeFileSync(path, 'agent-requested\n');
  assert.equal(agentRequested(path), true);      // present → requested
  clearAgentRequest(path);
  assert.equal(agentRequested(path), false);     // cleared
  assert.equal(existsSync(path), false);
});

// --- the request PAYLOAD (#664) ---
// The §3 exception: identity of what the run created, and the NAME of the condition
// that woke the agent. Every key is optional, and a key the worker did not write must
// read back as absent rather than as something invented.

test('readAgentRequest: a worker names what it made and why the agent is here', () => {
  const path = agentRequestPath({ pack: 'p', task: 't', slotId: 's-payload-test' });
  writeFileSync(path, `${JSON.stringify({
    marker: 'agent-requested',
    delivered: { branch: 'claudinite/maintenance-2026-08-06-l0i4gd', pr: 71, merged: true },
    reason: { code: 'checks-not-green', detail: 'check_the_world reported findings' },
  })}\n`);
  const payload = readAgentRequest(path);
  assert.equal(payload.delivered.pr, 71);
  assert.equal(payload.reason.code, 'checks-not-green');
  clearAgentRequest(path);
});

test('readAgentRequest: a bare marker, empty file, or garbage names nothing — never throws', () => {
  // The version-skew case: an older vendored worker writes a bare marker. It still
  // requests the agent; it just asserts nothing about why, and the issue says nothing.
  const path = agentRequestPath({ pack: 'p', task: 't', slotId: 's-payload-old' });
  for (const raw of ['agent-requested\n', '', '   \n', '{not json']) {
    writeFileSync(path, raw);
    const payload = readAgentRequest(path);
    assert.equal(payload?.delivered ?? null, null, JSON.stringify(raw));
    assert.equal(payload?.reason ?? null, null, JSON.stringify(raw));
  }
  clearAgentRequest(path);
  assert.equal(readAgentRequest(path), null);   // absent → no payload at all
});
