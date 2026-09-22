import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../../../../engine/remove-tree.mjs';
import { workerParams, emitVerdict, runWorkerModule } from '../../src/execute/worker-entry.mjs';
import { readTriageMarker, readRequeueMarker, readAgentRequest, agentRequested } from '../../src/execute/code-work.mjs';

// A task directory holding a declaration and a worker module, the shape the runner
// spawns the entry point in. The module name is unique per case: an ES module import
// is cached per URL, so two cases sharing a name would run the first one's code twice.
let seq = 0;
function taskDir({ decl = {}, worker = 'export const worker = () => {};\n' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-worker-entry-'));
  writeFileSync(join(dir, 'task.json'), JSON.stringify(decl));
  const file = `worker-${seq += 1}.mjs`;
  writeFileSync(join(dir, file), worker);
  return { dir, file };
}

const ENV = {
  CLAUDINITE_REPO_ROOT: '/checkout',
  CLAUDINITE_REPO: 'owner/name',
  CLAUDINITE_DEFAULT_BRANCH: 'main',
  CLAUDINITE_PACK: 'p',
  CLAUDINITE_TASK: 't',
  CLAUDINITE_ITEM: '42',
  CLAUDINITE_CONTEXT: 'first line\nsecond line',
  CLAUDINITE_TARGET_MODE: 'fresh',
  CLAUDINITE_TARGET_BRANCH: 'p/t-2026-09-22',
  CLAUDINITE_TARGET_PR: '77',
};

// The bag is the environment's parsed form: what every raw worker used to read for
// itself, read once here and handed over as data.
test('workerParams turns the code-work environment into the bag', () => {
  const { dir } = taskDir();
  try {
    const p = workerParams(ENV, dir);
    assert.equal(p.root, '/checkout');
    assert.equal(p.repo, 'owner/name');
    assert.equal(p.defaultBranch, 'main');
    assert.equal(p.pack, 'p');
    assert.equal(p.task, 't');
    assert.deepEqual(p.item, { number: 42 });
    assert.deepEqual(p.context, ['first line', 'second line']);
    assert.deepEqual(p.target, { mode: 'fresh', branch: 'p/t-2026-09-22', pr: 77 });
    assert.equal(workerParams({ ...ENV, GITHUB_TOKEN: 'ght' }, dir).token, 'ght');
    assert.equal(p.token, null, 'a run outside Actions carries none, and says so');
  } finally { removeTree(dir); }
});

// Unknown is a state of its own: a run with no pull request to amend must not read as
// PR 0, and a task with no Context as one empty bullet.
test('workerParams keeps an unset value null, and an unset Context empty', () => {
  const { dir } = taskDir();
  try {
    const p = workerParams({ ...ENV, CLAUDINITE_TARGET_PR: '', CLAUDINITE_CONTEXT: '' }, dir);
    assert.equal(p.target.pr, null);
    assert.deepEqual(p.context, []);
    const bare = workerParams({}, dir);
    assert.equal(bare.item.number, null);
    assert.equal(bare.repo, null);
    assert.deepEqual(bare.target, { mode: null, branch: null, pr: null });
  } finally { removeTree(dir); }
});

// Only the secrets the task DECLARED, read off the declaration beside the module
// rather than through a channel of its own - and a declared one the repo has not
// configured is absent from the bag, never an empty string.
test('workerParams bags the declared secrets only', () => {
  const { dir } = taskDir({ decl: { code_work_required_secrets: ['WANTED', 'UNSET'] } });
  try {
    const p = workerParams({ ...ENV, WANTED: 'v', OTHER: 'no' }, dir);
    assert.deepEqual(p.secrets, { WANTED: 'v' });
  } finally { removeTree(dir); }
});

test('workerParams reads the retired required_secrets spelling too', () => {
  const { dir } = taskDir({ decl: { required_secrets: ['WANTED'] } });
  try {
    assert.deepEqual(workerParams({ WANTED: 'v' }, dir).secrets, { WANTED: 'v' });
  } finally { removeTree(dir); }
});

// --- the verdict, rendered into the protocol the executor reads -------------------

test('emitVerdict prints the triage and requeue markers the executor parses', () => {
  const out = [];
  emitVerdict({ triage: { kind: 'action', detail: 'TOKEN lacks Actions: write' } }, { log: (l) => out.push(l) });
  emitVerdict({ requeue: { until: '2026-09-01T12:00:00Z', reason: 'not yet live' } }, { log: (l) => out.push(l) });
  assert.deepEqual(out, [
    'claudinite-needs-human: action - TOKEN lacks Actions: write',
    'claudinite-requeue: 2026-09-01T12:00:00Z - not yet live',
  ]);
});

// One wire format with an emitter here and a parser in code-work.mjs: the executor
// reads these lines out of the run's output, so a separator or a prefix the emitter
// changes on its own would be read as part of the detail, or not read at all.
test('what emitVerdict prints is what the executor parses back', () => {
  const out = [];
  emitVerdict({
    triage: { kind: 'action', detail: 'TOKEN lacks Actions: write' },
    requeue: { until: '2026-09-01T12:00:00Z', reason: 'not yet live' },
  }, { log: (l) => out.push(l) });
  const text = out.join('\n');
  assert.deepEqual(readTriageMarker(text), { kind: 'action', detail: 'TOKEN lacks Actions: write' });
  assert.deepEqual(readRequeueMarker(text), { until: '2026-09-01T12:00:00.000Z', reason: 'not yet live' });
  // A verdict with no detail parses as one, rather than as a detail of punctuation.
  const bare = [];
  emitVerdict({ triage: { kind: 'decision' }, requeue: { until: '2026-09-01T12:00:00Z' } }, { log: (l) => bare.push(l) });
  assert.deepEqual(readTriageMarker(bare.join('\n')), { kind: 'decision', detail: null });
  assert.deepEqual(readRequeueMarker(bare.join('\n')), { until: '2026-09-01T12:00:00.000Z', reason: null });
});

test('emitVerdict writes the agent request, carrying delivered and reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-worker-entry-'));
  const requestPath = join(dir, 'request');
  try {
    emitVerdict({ requestAgent: { delivered: { pr: 5, branch: 'b' }, reason: { code: 'diff', detail: '3 files' } } },
      { requestPath, log: () => {} });
    // Read back through the executor's own reader, which is what the hand-off uses.
    assert.equal(agentRequested(requestPath), true);
    assert.deepEqual(readAgentRequest(requestPath), {
      delivered: { pr: 5, branch: 'b' },
      reason: { code: 'diff', detail: '3 files' },
    });
  } finally { removeTree(dir); }
});

// The file's EXISTENCE is the control signal, so a bare request is a legal one.
test('emitVerdict writes a bare request for requestAgent: true', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-worker-entry-'));
  const requestPath = join(dir, 'request');
  try {
    emitVerdict({ requestAgent: true }, { requestPath, log: () => {} });
    assert.deepEqual(JSON.parse(readFileSync(requestPath, 'utf8')), {});
  } finally { removeTree(dir); }
});

test('emitVerdict writes nothing for a worker that returned nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-worker-entry-'));
  const requestPath = join(dir, 'request');
  const out = [];
  try {
    emitVerdict(undefined, { requestPath, log: (l) => out.push(l) });
    assert.deepEqual(out, []);
    assert.equal(existsSync(requestPath), false);
  } finally { removeTree(dir); }
});

// --- the whole wrapping ----------------------------------------------------------

const capture = () => {
  const log = []; const err = [];
  return { log, err, io: { log: (l) => log.push(l), err: (l) => err.push(l) } };
};

test('runWorkerModule calls the worker with the bag and reports the time it took', async () => {
  const { dir, file } = taskDir({
    worker: 'export const worker = (params) => { globalThis.__seen = params; };\n',
  });
  const { log, err, io } = capture();
  let clock = 1000;
  try {
    const r = await runWorkerModule(file, { env: ENV, taskDir: dir, ...io, now: () => (clock += 2500) });
    assert.equal(r.ok, true);
    assert.equal(globalThis.__seen.repo, 'owner/name');
    assert.deepEqual(globalThis.__seen.item, { number: 42 });
    assert.deepEqual(err, []);
    assert.match(log.at(-1), /^p\/t: worker done in 2\.5s$/);
  } finally { delete globalThis.__seen; removeTree(dir); }
});

// The failure line the executor's park comment is built from, and the exit the
// caller sets from it - a throw is the worker's only failure channel.
test('runWorkerModule turns a throw into the failure line, the stack, and not-ok', async () => {
  const { dir, file } = taskDir({ worker: 'export const worker = () => { throw new Error("upstream 500"); };\n' });
  const { log, err, io } = capture();
  try {
    const r = await runWorkerModule(file, { env: ENV, taskDir: dir, ...io, now: () => 0 });
    assert.equal(r.ok, false);
    assert.match(err[0], /^p\/t failed after 0\.0s: upstream 500$/);
    assert.match(err[1], /Error: upstream 500/, 'the stack follows the line');
    assert.equal(log.length, 0, 'no completion line for a run that failed');
  } finally { removeTree(dir); }
});

// The worker is the only thing that can tell a missing scope from a bug in its own
// code, so an error carrying that diagnosis routes the park.
test('runWorkerModule prints the triage marker of an error that carries one', async () => {
  const { dir, file } = taskDir({
    worker: 'export const worker = () => { const e = new Error("TOKEN lacks Actions: write"); e.triage = "action"; throw e; };\n',
  });
  const { err, io } = capture();
  try {
    const r = await runWorkerModule(file, { env: ENV, taskDir: dir, ...io, now: () => 0 });
    assert.equal(r.ok, false);
    assert.equal(err[0], 'claudinite-needs-human: action - TOKEN lacks Actions: write');
  } finally { removeTree(dir); }
});

// A module that does not hold up its half of the contract fails as a failed run,
// naming what it is missing: the runner calls exactly one export.
test('runWorkerModule fails a module that exports no worker', async () => {
  const { dir, file } = taskDir({ worker: 'export const main = () => {};\n' });
  const { err, io } = capture();
  try {
    const r = await runWorkerModule(file, { env: ENV, taskDir: dir, ...io, now: () => 0 });
    assert.equal(r.ok, false);
    assert.match(err[0], /exports no `worker` function/);
  } finally { removeTree(dir); }
});

test('runWorkerModule fails a module that is not there', async () => {
  const { dir } = taskDir();
  const { err, io } = capture();
  try {
    const r = await runWorkerModule('absent.mjs', { env: ENV, taskDir: dir, ...io, now: () => 0 });
    assert.equal(r.ok, false);
    assert.match(err[0], /^p\/t failed after/);
  } finally { removeTree(dir); }
});

// An async worker is awaited: a module returning a promise must not be reported done
// before its work settles, nor have a rejection escape as an unhandled one.
test('runWorkerModule awaits an async worker, verdict and rejection alike', async () => {
  const done = taskDir({
    worker: 'export const worker = async () => { await new Promise((r) => setTimeout(r, 5)); return { triage: { kind: "decision" } }; };\n',
  });
  const failed = taskDir({ worker: 'export const worker = async () => { throw new Error("late"); };\n' });
  const a = capture();
  const b = capture();
  try {
    assert.equal((await runWorkerModule(done.file, { env: ENV, taskDir: done.dir, ...a.io, now: () => 0 })).ok, false,
      'a triage verdict is a failed run - the executor reads the marker only off a non-zero exit');
    assert.equal(a.log[0], 'claudinite-needs-human: decision');
    assert.equal((await runWorkerModule(failed.file, { env: ENV, taskDir: failed.dir, ...b.io, now: () => 0 })).ok, false);
    assert.match(b.err[0], /late/);
  } finally { removeTree(done.dir); removeTree(failed.dir); }
});
