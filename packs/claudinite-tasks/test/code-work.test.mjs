import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCodeWork, codeWorkFailure, agentRequestPath, clearAgentRequest, agentRequested, readAgentRequest, readTriageMarker, readRequeueMarker } from '../code-work.mjs';

const NODE = process.execPath; // the running node, so the tests don't assume PATH

test('runCodeWork: a clean exit is ok', async () => {
  const r = await runCodeWork(`"${NODE}" -e "process.exit(0)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 0);
});

test('runCodeWork: a non-zero exit is a failure carrying the code', async () => {
  const r = await runCodeWork(`"${NODE}" -e "process.exit(3)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 3);
});

test('runCodeWork: an overrun is hard-killed and reported timedOut', async () => {
  const r = await runCodeWork(`"${NODE}" -e "setTimeout(()=>{}, 10000)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 0.3 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.notEqual(r.signal, null); // killed by signal, not a clean exit
});

// The kill has to reach the WORKER, not the shell `shell: true` wraps it in.
// Killing only the shell leaves the worker running — still acting on the repo —
// while the scheduler reports it hard-killed, and the promise resolves late
// because the grandchild holds the stdio pipes open until it finishes anyway.
// So the assertion is the side effect: the work the worker would have done past
// its bound must never appear.
test('runCodeWork: the timeout kills the worker itself, not just the shell around it', async () => {
  const marker = join(tmpdir(), `claudinite-code_work-kill-${process.pid}-${Date.now()}`);
  rmSync(marker, { force: true });
  const cmd = `"${NODE}" -e "setTimeout(()=>require('fs').writeFileSync(process.argv[1],'survived'),1500)" "${marker}"`;
  const started = Date.now();
  const r = await runCodeWork(cmd, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 0.3 });
  assert.equal(r.timedOut, true);
  // Resolving is not enough: it must resolve when the kill lands, not when the
  // worker would have finished on its own.
  assert.ok(Date.now() - started < 1200, `runCodeWork waited out the worker (${Date.now() - started}ms)`);
  await new Promise((res) => setTimeout(res, 1800)); // past when the worker would have written
  assert.equal(existsSync(marker), false, 'the worker outlived its code_work_timeout and kept working');
  rmSync(marker, { force: true });
});

test('runCodeWork: the child inherits the injected env', async () => {
  const cmd = `"${NODE}" -e "process.exit(process.env.CLAUDINITE_SLOT_ID === 'd2026' ? 0 : 1)"`;
  const r = await runCodeWork(cmd, { taskDir: process.cwd(), env: { ...process.env, CLAUDINITE_SLOT_ID: 'd2026' }, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
});

test('runCodeWork: a command that cannot start is a failure, not a throw', async () => {
  const r = await runCodeWork('definitely-not-a-real-command-xyz', { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
});

// A cwd that no longer exists is reported by Node as an ENOENT on the SHELL, which
// names the one thing that is not missing. The task directory can vanish under a
// run in flight (an earlier item's mount update deletes a retired task), so this
// failure has to say which directory is gone.
test('runCodeWork: a task directory that is gone names the directory, not the shell', async () => {
  const gone = join(process.cwd(), 'no-such-task-dir-2fbb1c');
  const r = await runCodeWork(`"${NODE}" -e "process.exit(0)"`, { taskDir: gone, env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /no-such-task-dir-2fbb1c/);
  assert.doesNotMatch(r.stderr, /\/bin\/sh/);
});

// The worker's own output is the scheduler's only account of what preprocessing did.
// Before it was echoed, a failed worker read as a bare `preprocessing exited 1` and
// diagnosing one meant reproducing it by hand.

test('runCodeWork: the child output is echoed as it arrives, tagged by stream', async () => {
  const seen = [];
  const cmd = `"${NODE}" -e "process.stdout.write('converging\\n'); process.stderr.write('rejected\\n')"`;
  const r = await runCodeWork(cmd, {
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

test('runCodeWork: a worker killed at its timeout still echoed what it printed first', async () => {
  const seen = [];
  const cmd = `"${NODE}" -e "process.stdout.write('got this far\\n'); setTimeout(()=>{}, 10000)"`;
  const r = await runCodeWork(cmd, {
    taskDir: process.cwd(), env: process.env, timeoutSeconds: 0.5,
    echo: (chunk) => seen.push(chunk),
  });
  assert.equal(r.timedOut, true);
  // This is the whole reason the echo is live rather than a dump at exit: the buffer
  // of a SIGKILLed child is exactly the output nobody would otherwise ever see.
  assert.deepEqual(seen, ['got this far\n']);
});

test('runCodeWork: a broken echo sink never fails the run', async () => {
  const r = await runCodeWork(`"${NODE}" -e "console.log('hi')"`, {
    taskDir: process.cwd(),
    env: process.env,
    timeoutSeconds: 10,
    echo: () => { throw new Error('sink is gone'); },
  });
  assert.equal(r.ok, true);       // the run's verdict is the child's, never the log's
  assert.equal(r.stdout, 'hi\n'); // and the collection is unaffected
});

test('codeWorkFailure: distinguishes a timeout from a non-zero exit', () => {
  assert.match(codeWorkFailure({ timedOut: true, code: null, stderr: '' }), /exceeded its code_work_timeout/);
  assert.match(codeWorkFailure({ timedOut: false, code: 2, stderr: '' }), /exited 2/);
  assert.match(codeWorkFailure({ timedOut: false, code: null, stderr: 'boom\n' }), /could not run: boom/);
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

// --- the worker's own triage verdict ------------------------------------------

// The executor reads an exit code and cannot tell a missing scope from a bug. This
// is the one line a worker gets to say which, and it has to survive being read out
// of a live output stream — a worker SIGKILLed at its timeout writes no file.
test('a worker\'s triage marker is read off its output, last one winning', () => {
  assert.deepEqual(
    readTriageMarker('sweeping\nclaudinite-needs-human: action — PAT lacks Actions: write\ndone'),
    { kind: 'action', detail: 'PAT lacks Actions: write' },
  );
  // A sweep may revise its verdict as it works through its targets.
  assert.deepEqual(
    readTriageMarker('claudinite-needs-human: action\nclaudinite-needs-human: failure — threw on repo 3'),
    { kind: 'failure', detail: 'threw on repo 3' },
  );
  // Absence is the whole compatibility story: every worker written before this
  // says nothing, and says it in every run.
  assert.equal(readTriageMarker('just a normal failure\n'), null);
  assert.equal(readTriageMarker(''), null);
  assert.deepEqual(readTriageMarker('claudinite-needs-human: decision'), { kind: 'decision', detail: null });
});

// --- the worker's requeue ask --------------------------------------------------

// A worker that finds its subject NOT YET THERE (a production verification whose
// release has not landed) has done its run and must come back later — an outcome
// no exit code can say: 0 closes the item done and non-zero parks it. The marker
// is the third answer, read off the output like the triage marker and honoured
// only on a clean exit.
test('a worker\'s requeue marker is read off its output, last one winning', () => {
  assert.deepEqual(
    readRequeueMarker('probing\nclaudinite-requeue: 2026-09-01T12:00:00Z — not yet live: mode unstamped\ndone'),
    { until: '2026-09-01T12:00:00.000Z', reason: 'not yet live: mode unstamped' },
  );
  // The last marker wins, so a worker may revise its wake as it works.
  assert.deepEqual(
    readRequeueMarker('claudinite-requeue: 2026-09-01T00:00:00Z\nclaudinite-requeue: 2026-09-02T00:00:00Z — later'),
    { until: '2026-09-02T00:00:00.000Z', reason: 'later' },
  );
  // The instant is normalized to UTC ISO, whatever offset the worker printed.
  assert.equal(readRequeueMarker('claudinite-requeue: 2026-09-01T14:00:00+02:00 — tz').until,
    '2026-09-01T12:00:00.000Z');
  // Absence is the compatibility story: every worker written before this says
  // nothing, and an ordinary run must never read as a requeue.
  assert.equal(readRequeueMarker('all done\n'), null);
  assert.equal(readRequeueMarker(''), null);
  // A marker whose instant does not parse is an ASK THAT CANNOT BE HONOURED —
  // returned with `until: null` so the executor can park it loudly, never
  // silently dropped (the item would close done while the worker meant "wait").
  assert.deepEqual(readRequeueMarker('claudinite-requeue: tomorrow-ish — huh'),
    { until: null, reason: 'huh' });
});
