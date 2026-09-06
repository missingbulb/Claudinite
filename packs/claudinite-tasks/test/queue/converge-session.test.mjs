// CONVERGING WITHOUT A REST ROUTE (#1374). A session `invoke.mjs` fires has
// GitHub access of its own but none a subprocess can reach, which made the last
// step of every agentic run the one step that environment could not take —
// fourteen items stranded in the `missingbulb/WIP` member.
//
// What these pin: one planner describes the transition, and the script addressed
// to the session's own tools performs exactly what the REST executor would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convergeOps, sessionScript } from '../../queue/converge-item.mjs';

const item = (over = {}) => ({
  number: 7, title: '[claudinite-work] p/a', state: 'open', labels: ['task:status:running-agent'],
  body: 'packs/p/tasks/a/task.md\n', ...over,
});
const done = { issue: 7, outcome: 'done', summary: 'the run succeeded', pr: null };
const kinds = (ops) => ops.map((o) => o.kind);
const markedItem = (over = {}) => item({
  title: 'Please add a dark mode',
  body: 'Please add a dark mode.\n\n<!-- claudinite-item -->\npacks/p/tasks/a/task.md\n<!-- /claudinite-item -->\n',
  ...over,
});

test('the planner ends a successful run: comment, record, claim gone, outcome, closed', () => {
  const ops = convergeOps(item(), done);
  assert.deepEqual(kinds(ops).filter((k) => k !== 'removeLabel'),
    ['comment', 'record', 'addLabel', 'close']);
  assert.ok(ops.some((o) => o.kind === 'removeLabel' && o.name === 'task:status:running-agent'),
    'every spelling of the claim is dropped, unconditionally');
  assert.deepEqual(ops.at(-1), { kind: 'close', issue: 7, stateReason: 'completed' });
});

test('a park is ONE label and closes nothing', () => {
  // Never a pair (#1385): a two-label park could be half-applied, which is a torn
  // state of its own.
  const ops = convergeOps(item(), { issue: 7, outcome: 'failure', summary: 'broke' });
  assert.ok(!kinds(ops).includes('close'), 'a park leaves the item open');
  assert.deepEqual(ops.filter((o) => o.kind === 'addLabel').map((o) => o.name),
    ['task:status:needs-human-failure']);
});

// A DONE TERMINAL CLOSES THE ISSUE IT STANDS ON, marked or filed (#1489). `done`
// means nothing is left for anyone to act on, and an issue left open under it asks
// its author to come and agree — which is the one thing the run already settled.
test('a done terminal closes a marked issue too', () => {
  assert.deepEqual(convergeOps(markedItem(), done).at(-1), { kind: 'close', issue: 7, stateReason: 'completed' });
});

// The contrast, and the half of the old rule that survives: a park is waiting on a
// person, so it leaves the person's own issue open to wait on.
test('a park on a marked issue leaves it open', () => {
  const ops = convergeOps(markedItem(), { issue: 7, outcome: 'approval', summary: 'left a PR', pr: 9 });
  assert.ok(!kinds(ops).includes('close'), 'a park is not an ending');
});

// A marked issue has no `[claudinite-work]` title to render a record from, so the
// close is the transition's last step and the labels it writes are the computed set.
test('the session script closes a marked issue with the labels the transition leaves', () => {
  const script = sessionScript(markedItem({ labels: ['task:status:running-agent', 'task:origin:ad-hoc'] }), done, 'o/r');
  assert.match(script, /labels `\["task:origin:ad-hoc","task:status:done"\]`, state `closed`, state_reason `completed`/);
});

test('the session script preserves labels the transition never mentions', () => {
  const script = sessionScript(item({ labels: ['task:status:running-agent', 'pinned', 'area:backend'] }), done, 'o/r');
  assert.match(script, /labels `\["pinned","area:backend","task:status:done"\]`/);
  assert.doesNotMatch(script, /running-agent"/, 'the claim is not carried into the written set');
});

test('the session script tells the session to emit the census record itself', () => {
  // The fold reads the census out of the transcript, and in this path no other
  // process runs — so an unemitted record is a run missing from the census.
  const script = sessionScript(item(), done, 'o/r');
  assert.match(script, /claudinite-task-exec v1 p\/a \[#7\] success/);
  assert.match(script, /Output this line/);
});

test('a foreign issue is a read-modify-write, never a computed label set', () => {
  // The legacy shadow model's write-back. This process never saw that issue's
  // labels, so writing a computed set would silently drop every one of them.
  const legacy = item({ body: 'packs/p/tasks/a/task.md\nRequest: #42\n' });
  const script = sessionScript(legacy, { issue: 7, outcome: 'approval', summary: 'left a PR', pr: 94 }, 'o/r');
  assert.match(script, /On #42: REMOVE the label `claude-queued`/);
  assert.match(script, /On #42: ADD the label `claude-in-review`/);
  assert.match(script, /Read that issue's current labels first/);
  assert.doesNotMatch(script, /issue_number `42`, labels/, 'never a computed set for an issue we did not read');
});

test('the script names the repo it was given, on every call', () => {
  const script = sessionScript(item(), done, 'missingbulb/WIP');
  for (const line of script.split('\n').filter((l) => l.includes('`issue_write`') || l.includes('`add_issue_comment`'))) {
    assert.match(line, /owner `missingbulb`, repo `WIP`/);
  }
});


// THE CLI IS THE SESSION'S WHOLE INTERFACE (#1491). The planner tests above cover
// what a convergence IS; these cover the one way a session ever reaches it. A
// session has no REST route, so the run that prints the calls is the SUCCESSFUL
// run — it must say so on stdout and exit 0, or the session reads its own normal
// path as a failure and stops, which is what left five sampled items parked.
const CLI = new URL('../../queue/converge-item.mjs', import.meta.url).pathname;

const runCli = (args, env = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
  let out = ''; let err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ code, out, err }));
});

const itemFile = (item) => {
  const f = join(mkdtempSync(join(tmpdir(), 'converge-')), 'item.json');
  writeFileSync(f, JSON.stringify(item));
  return f;
};

const cliItem = {
  number: 7,
  title: '[claudinite-work] basics/task-janitor',
  body: 'packs/basics/tasks/task-janitor/task.md\n',
  state: 'open',
  labels: [{ name: 'task:status:running-agent' }],
};

test('--item-file prints the session script and exits 0 — printing the calls IS the success', async () => {
  const { code, out, err } = await runCli([
    '--issue', '7', '--outcome', 'done', '--summary', 'swept the queue',
    '--repo', 'o/r', '--item-file', itemFile(cliItem),
  ]);
  assert.equal(code, 0, `expected success, got ${code}. stderr: ${err}`);
  assert.match(out, /add_issue_comment/);
  assert.match(out, /issue_write/);
  assert.match(out, /swept the queue/);
});

test('the CLI never speaks of REST — a session has none, so naming it reads as breakage', async () => {
  const { out, err } = await runCli([
    '--issue', '7', '--outcome', 'done', '--summary', 'swept',
    '--repo', 'o/r', '--item-file', itemFile(cliItem),
  ]);
  assert.doesNotMatch(`${out}${err}`, /REST/i);
});

test('a refusal is still a refusal: an item not with an agent exits non-zero', async () => {
  const { code, err } = await runCli([
    '--issue', '7', '--outcome', 'done', '--summary', 'swept',
    '--repo', 'o/r', '--item-file', itemFile({ ...cliItem, labels: [{ name: 'task:status:ready' }] }),
  ]);
  assert.notEqual(code, 0);
  assert.match(err, /does not hold it|not with an agent/);
});
