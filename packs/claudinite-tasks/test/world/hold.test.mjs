// The operator hold (docs/PRINCIPLES.md) and the two bounds the heartbeat left
// behind. What is pinned here is the part that has bitten this repo before: a
// safety knob whose producer and consumer stopped agreeing, and a parameter that
// defaults to the operation's most dangerous mode when it stops being read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUSPEND_ALL_VAR, isSuspended, suspendedNotice } from '../../src/world/hold.mjs';
import { VARS_BAG_ENV } from '../../src/world/vars-bag.mjs';
import { HEARTBEAT_MS } from '../../src/items/heartbeat.mjs';
import { EXECUTING_LEASH_MS } from '../../public/task-constants.mjs';

const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
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
// silence on either side (#974): the workflows against the constant the reader
// imports, and each entry point by running it under the hold.
test('every workflow stamps the hold, and every entry point exits on it before reading anything', () => {
  for (const wf of [
    '.github/workflows/claudinite-scheduler.yml',
    '.github/workflows/claudinite-executor.yml',
    'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
    'packs/claudinite-tasks/stubs/claudinite-executor.yml',
  ]) {
    assert.match(read(wf), new RegExp(`${SUSPEND_ALL_VAR}: \\$\\{\\{ vars\\.${SUSPEND_ALL_VAR} \\}\\}`), wf);
  }
  // FIRST ACT means before the config load and before the first API call: with no
  // token and no repository in the environment, a run that read anything would fail
  // — a held one exits clean, saying why.
  for (const entry of ['packs/claudinite-tasks/public/scheduler-run.mjs', 'packs/claudinite-tasks/public/executor.mjs',
    'packs/claudinite-tasks/src/schedule/run.mjs', 'packs/claudinite-tasks/src/execute/loop.mjs']) {
    const env = { ...process.env, [SUSPEND_ALL_VAR]: 'true', GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' };
    const r = spawnSync(process.execPath, [join(CANON, entry)], { encoding: 'utf8', env });
    assert.equal(r.status, 0, `${entry}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes(suspendedNotice()), `${entry}: a held run must say it is held`);
  }
});

// --- the hold reads through the vars bag (vars-bag.mjs) ------------------------------
//
// The executor carries every repository variable as one bag, and that is where the
// hold is read from — the REST variables API the Actions token is refused on is not
// asked (missingbulb/Shepherd run 34955548243 logged that refusal on every drain).
// The scheduler carries no bag, so there the named env copy is the only channel.
test('the hold reads from the vars bag when the job carries one', () => {
  const bagged = (value, rest = {}) => ({ ...rest, [VARS_BAG_ENV]: JSON.stringify({ [SUSPEND_ALL_VAR]: value }) });
  assert.equal(isSuspended(bagged('true')), true);
  assert.equal(isSuspended(bagged('false')), false);
  // The two copies come from the same context, so the bag answers; a named copy
  // beside an unset bag is the scheduler's shape and still answers.
  assert.equal(isSuspended(bagged('true', { [SUSPEND_ALL_VAR]: '' })), true);
  assert.equal(isSuspended({ [SUSPEND_ALL_VAR]: 'true', [VARS_BAG_ENV]: JSON.stringify({ OTHER: 'x' }) }), true);
  assert.equal(isSuspended({ [SUSPEND_ALL_VAR]: 'true' }), true);
  // A malformed bag contributes nothing rather than masking the named copy.
  assert.equal(isSuspended({ [SUSPEND_ALL_VAR]: 'true', [VARS_BAG_ENV]: '{oops' }), true);
});

// --- the bounds the heartbeat reframed (PRINCIPLES.md) --------------------------------

// F17, restated: what must hold is that a LIVE holder is never reclaimed. The old
// form of this — a run cap ≤ the leash — is what the heartbeat replaced.
test('a beating holder cannot be reclaimed: the interval is well inside the leash', () => {
  assert.ok(HEARTBEAT_MS * 3 < EXECUTING_LEASH_MS,
    `a holder must miss several beats before the leash reclaims it (${HEARTBEAT_MS}ms vs ${EXECUTING_LEASH_MS}ms)`);
});

// The cap's retirement is the whole point of the heartbeat, so a workflow that
// quietly reinstated one would undo it without anything failing.
test('no executor run is capped at the leash any more', () => {
  const executor = read('packs/claudinite-tasks/stubs/claudinite-executor.yml');
  const caps = [...executor.matchAll(/timeout-minutes:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(caps.length, 1, 'the executing job carries exactly one bound');
  assert.ok(caps[0] > EXECUTING_LEASH_MS / 60e3,
    'a cap at or under the leash is the retired F17 arithmetic, not a wedged-runner backstop');
});
