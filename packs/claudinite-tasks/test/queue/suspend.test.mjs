// The operator hold (DESIGN §8, §15.24) and the two bounds the heartbeat left
// behind. What is pinned here is the part that has bitten this repo before: a
// safety knob whose producer and consumer stopped agreeing, and a parameter that
// defaults to the operation's most dangerous mode when it stops being read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUSPEND_ALL_VAR, isSuspended, readSuspendedNow, suspendedNotice } from '../../queue/suspend.mjs';
import { HEARTBEAT_MS } from '../../queue/heartbeat.mjs';
import { EXECUTING_LEASH_MS } from '../../queue/leases.mjs';

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
  for (const entry of ['packs/claudinite-tasks/queue/scheduler-run.mjs', 'packs/claudinite-tasks/queue/executor.mjs']) {
    const env = { ...process.env, [SUSPEND_ALL_VAR]: 'true', GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' };
    const r = spawnSync(process.execPath, [join(CANON, entry)], { encoding: 'utf8', env });
    assert.equal(r.status, 0, `${entry}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes(suspendedNotice()), `${entry}: a held run must say it is held`);
  }
});

// --- the between-items read (§15.30) -----------------------------------------
//
// A batched drain outlives the env copy it started with, so the hold it must obey
// is the one the API reports NOW. Each branch below is a different way of being
// wrong about a running queue, which is why they are pinned one by one.

const ghAnswering = (status, value) => async () => ({ status, json: value === undefined ? null : { value } });

test('the live hold read decodes the variable exactly as the env copy does', async () => {
  for (const on of ['true', 'TRUE', ' true ', '1', 'yes']) {
    assert.equal(await readSuspendedNow(ghAnswering(200, on), 'o/r'), true, on);
  }
  for (const off of ['false', '0', 'no', '', 'maybe']) {
    assert.equal(await readSuspendedNow(ghAnswering(200, off), 'o/r'), false, String(off));
  }
});

// The normal state of every repo nobody has ever held: no such variable. That is
// not a fault and must not read as one.
test('an absent variable is not a hold and says nothing about it', async () => {
  const lines = [];
  assert.equal(await readSuspendedNow(ghAnswering(404), 'o/r', { log: (l) => lines.push(l) }), false);
  assert.deepEqual(lines, []);
});

// A READ THAT DID NOT ANSWER IS NOT A VERDICT. It falls back to the value this
// run started with — so a held run stays held and an unheld one keeps draining —
// and it says so, because a live check that silently stopped being live is the
// failure nothing else here would surface.
test('a refused live read falls back to the start value and names what would fix it', async () => {
  const lines = [];
  const held = await readSuspendedNow(ghAnswering(403), 'o/r',
    { env: { [SUSPEND_ALL_VAR]: 'true' }, log: (l) => lines.push(l) });
  assert.equal(held, true, 'the run started held, so it stays held');
  assert.equal(await readSuspendedNow(ghAnswering(403), 'o/r', { env: {} }), false);
  assert.ok(lines.some((l) => l.startsWith('!') && l.includes(SUSPEND_ALL_VAR)), lines.join('\n'));
  assert.ok(lines.some((l) => /variables read/.test(l)), 'the log names the access it lacked');
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
  const executor = read('packs/claudinite-tasks/stubs/claudinite-executor.yml');
  const caps = [...executor.matchAll(/timeout-minutes:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(caps.length, 1, 'the executing job carries exactly one bound');
  assert.ok(caps[0] > EXECUTING_LEASH_MS / 60e3,
    'a cap at or under the leash is the retired F17 arithmetic, not a wedged-runner backstop');
});
