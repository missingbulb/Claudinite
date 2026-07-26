import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { runPreprocessing, preprocessingFailure, agentRequestPath, clearAgentRequest, agentRequested, parseSecretsBundle, resolveTaskSecrets, preprocessingEnv, SECRETS_BUNDLE_VAR } from '../../engine/scheduler/preprocess.mjs';

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

// --- task-declared repo secrets (agent-preprocessing DESIGN §9) --------------

test('parseSecretsBundle: real JSON parses; absent/blank/malformed/non-object read as empty', () => {
  assert.deepEqual(parseSecretsBundle('{"A":"1"}'), { A: '1' });
  assert.deepEqual(parseSecretsBundle(undefined), {});
  assert.deepEqual(parseSecretsBundle('  '), {});
  assert.deepEqual(parseSecretsBundle('not json'), {});
  assert.deepEqual(parseSecretsBundle('["A"]'), {});
});

test('resolveTaskSecrets: hands back ONLY the declared names, and reports the unconfigured ones', () => {
  const bundle = JSON.stringify({ SCRAPER_API_KEY: 'k', OTHER_SECRET: 'nope', github_token: 'x' });
  const { env, missing } = resolveTaskSecrets(['SCRAPER_API_KEY'], bundle);
  assert.deepEqual(env, { SCRAPER_API_KEY: 'k' });   // an undeclared secret never reaches the worker
  assert.deepEqual(missing, []);

  const r2 = resolveTaskSecrets(['SCRAPER_API_KEY', 'ABSENT_KEY'], bundle);
  assert.deepEqual(r2.env, { SCRAPER_API_KEY: 'k' });
  assert.deepEqual(r2.missing, ['ABSENT_KEY']);
});

test('resolveTaskSecrets: an unset secret renders as "" in toJSON(secrets) and counts as missing', () => {
  const { env, missing } = resolveTaskSecrets(['EMPTY_KEY'], JSON.stringify({ EMPTY_KEY: '' }));
  assert.deepEqual(env, {});
  assert.deepEqual(missing, ['EMPTY_KEY']);
});

test('resolveTaskSecrets: no declaration needs no bundle', () => {
  assert.deepEqual(resolveTaskSecrets(undefined, undefined), { env: {}, missing: [] });
});

test('preprocessingEnv: STRIPS the secrets bundle and adds context + resolved secrets', () => {
  const parent = { PATH: '/bin', [SECRETS_BUNDLE_VAR]: '{"SCRAPER_API_KEY":"k","OTHER":"o"}', GITHUB_TOKEN: 't' };
  const env = preprocessingEnv(parent, { CLAUDINITE_TASK: 'create-extractor' }, { SCRAPER_API_KEY: 'k' });
  assert.equal(env[SECRETS_BUNDLE_VAR], undefined);  // the bundle never reaches a worker
  assert.equal(env.SCRAPER_API_KEY, 'k');            // its own declared secret does
  assert.equal(env.OTHER, undefined);                // another task's secret does not
  assert.equal(env.GITHUB_TOKEN, 't');               // the Action token still rides in
  assert.equal(env.CLAUDINITE_TASK, 'create-extractor');
});

test('preprocessingEnv: the strip survives into a real child process', async () => {
  const cmd = `"${NODE}" -e "process.exit(process.env.${SECRETS_BUNDLE_VAR} === undefined && process.env.SCRAPER_API_KEY === 'k' ? 0 : 1)"`;
  const env = preprocessingEnv({ ...process.env, [SECRETS_BUNDLE_VAR]: '{"SCRAPER_API_KEY":"k"}' }, {}, { SCRAPER_API_KEY: 'k' });
  const r = await runPreprocessing(cmd, { taskDir: process.cwd(), env, timeoutSeconds: 10 });
  assert.equal(r.ok, true);
});
