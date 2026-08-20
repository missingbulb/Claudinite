// The operator hold (DESIGN §8, §15.24) and the two bounds the heartbeat left
// behind. What is pinned here is the part that has bitten this repo before: a
// safety knob whose producer and consumer stopped agreeing, and a parameter that
// defaults to the operation's most dangerous mode when it stops being read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUSPEND_ALL_VAR, isSuspended, suspendedNotice } from '../../../engine/scheduler/queue/suspend.mjs';
import { HEARTBEAT_MS } from '../../../engine/scheduler/queue/heartbeat.mjs';
import { EXECUTING_LEASH_MS } from '../../../engine/scheduler/queue/leases.mjs';

const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(join(CANON, p), 'utf8');

test('the hold reads as on only for a deliberate yes', () => {
  for (const on of ['true', 'TRUE', ' true ', '1', 'yes']) {
    assert.equal(isSuspended({ [SUSPEND_ALL_VAR]: on }), true, on);
  }
  // A variable somebody set to `false` to mean "off" must never read as a hold —
  // and neither must the unset case, which is every repo that never touched it.
  for (const off of ['false', '0', 'no', '', undefined, 'maybe']) {
    assert.equal(isSuspended({ [SUSPEND_ALL_VAR]: off }), false, String(off));
  }
  assert.equal(isSuspended({}), false);
});

// A held run exits clean, which is indistinguishable from a run that found no
// work — unless it says which one it was.
test('a held run says why it did nothing, and how to resume', () => {
  assert.match(suspendedNotice(), new RegExp(SUSPEND_ALL_VAR));
  assert.match(suspendedNotice(), /resume/i);
});

// THE PRODUCER AND THE CONSUMER MUST AGREE. A knob stamped into no workflow is a
// knob nobody can turn; a knob read by no entry point is one that looks turnable
// and does nothing. Both halves are asserted here because the failure mode is
// silence on either side (#974).
test('every workflow stamps the hold, and every entry point reads it', () => {
  for (const wf of [
    '.github/workflows/claudinite-scheduler.yml',
    '.github/workflows/claudinite-executor.yml',
    'engine/scheduler/stubs/claudinite-tick.yml',
    'engine/scheduler/stubs/claudinite-executor.yml',
  ]) {
    assert.match(read(wf), new RegExp(`${SUSPEND_ALL_VAR}: \\$\\{\\{ vars\\.${SUSPEND_ALL_VAR} \\}\\}`), wf);
  }
  for (const entry of ['engine/scheduler/queue/tick.mjs', 'engine/scheduler/queue/executor.mjs']) {
    assert.match(read(entry), /isSuspended\(\)/, entry);
  }
});

// FIRST ACT means before the config load and before the first API call: a gate
// that ran after them would read the world it is meant not to touch.
test('the gate is the first thing either entry point does', () => {
  for (const entry of ['engine/scheduler/queue/tick.mjs', 'engine/scheduler/queue/executor.mjs']) {
    const main = read(entry).slice(read(entry).indexOf('async function main() {'));
    const gate = main.indexOf('isSuspended()');
    const firstRead = Math.min(
      ...[main.indexOf('loadConfig('), main.indexOf('makeGh(')].filter((n) => n > 0),
    );
    assert.ok(gate > 0 && gate < firstRead, `${entry}: the hold is checked after the run has already started reading`);
  }
});

// --- the bounds the heartbeat reframed (§15.15) --------------------------------

// F17, restated: what must hold is that a LIVE holder is never reclaimed. The old
// form of this — a run cap ≤ the leash — is what the heartbeat replaced.
test('a beating holder cannot be reclaimed: the interval is well inside the leash', () => {
  assert.ok(HEARTBEAT_MS * 3 < EXECUTING_LEASH_MS,
    `a holder must miss several beats before the leash reclaims it (${HEARTBEAT_MS}ms vs ${EXECUTING_LEASH_MS}ms)`);
});

// The cap's retirement is the whole point of the heartbeat, so a workflow that
// quietly reinstated one would undo it without anything failing.
test('no executor run is capped at the leash any more', () => {
  const executor = read('engine/scheduler/stubs/claudinite-executor.yml');
  const caps = [...executor.matchAll(/timeout-minutes:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(caps.length, 1, 'the executing job carries exactly one bound');
  assert.ok(caps[0] > EXECUTING_LEASH_MS / 60e3,
    'a cap at or under the leash is the retired F17 arithmetic, not a wedged-runner backstop');
});

// The drain must not sit in the tick's concurrency group (§15.16). It leaves by
// dispatching the executor workflow rather than being one — which is also why it
// needs no secrets and no work bound.
test('the tick workflow starts the drain rather than running it', () => {
  const tick = read('engine/scheduler/stubs/claudinite-tick.yml');
  assert.match(tick, /createWorkflowDispatch/, 'the drain dispatches');
  assert.doesNotMatch(tick, /queue\/executor\.mjs/, 'and never runs an executor inside the tick\'s group');
});
