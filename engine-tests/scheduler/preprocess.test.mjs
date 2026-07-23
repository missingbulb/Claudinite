import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPreprocessing, preprocessingFailure } from '../../engine/scheduler/preprocess.mjs';

const NODE = process.execPath; // the running node, so the tests don't assume PATH

test('runPreprocessing: a clean exit is ok', async () => {
  const r = await runPreprocessing(`"${NODE}" -e "process.exit(0)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 0);
});

test('runPreprocessing: a non-zero exit is a failure carrying the code', async () => {
  const r = await runPreprocessing(`"${NODE}" -e "process.exit(3)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 3);
});

test('runPreprocessing: an overrun is hard-killed and reported timedOut', async () => {
  const r = await runPreprocessing(`"${NODE}" -e "setTimeout(()=>{}, 10000)"`, { taskDir: process.cwd(), env: process.env, timeoutSeconds: 0.3 });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.notEqual(r.signal, null); // killed by signal, not a clean exit
});

test('runPreprocessing: the child inherits the injected env', async () => {
  const cmd = `"${NODE}" -e "process.exit(process.env.CLAUDINITE_SLOT_ID === 'd2026' ? 0 : 1)"`;
  const r = await runPreprocessing(cmd, { taskDir: process.cwd(), env: { ...process.env, CLAUDINITE_SLOT_ID: 'd2026' }, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
});

test('runPreprocessing: a command that cannot start is a failure, not a throw', async () => {
  const r = await runPreprocessing('definitely-not-a-real-command-xyz', { taskDir: process.cwd(), env: process.env, timeoutSeconds: 10 });
  assert.equal(r.ok, false);
});

test('preprocessingFailure: distinguishes a timeout from a non-zero exit', () => {
  assert.match(preprocessingFailure({ timedOut: true, code: null, stderr: '' }), /exceeded its agent_preprocessing_timeout/);
  assert.match(preprocessingFailure({ timedOut: false, code: 2, stderr: '' }), /exited 2/);
  assert.match(preprocessingFailure({ timedOut: false, code: null, stderr: 'boom\n' }), /could not run: boom/);
});
