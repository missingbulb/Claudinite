// CONVERGING WITHOUT A REST ROUTE (#1374). A session `invoke.mjs` fires has
// GitHub access of its own but none a subprocess can reach, which made the last
// step of every agentic run the one step that environment could not take —
// fourteen items stranded in the `missingbulb/WIP` member.
//
// What these pin: one planner describes the transition, and the script addressed
// to the session's own tools performs exactly what the REST executor would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convergeOps, sessionScript, canReachRepo } from '../../queue/converge-item.mjs';

const item = (over = {}) => ({
  number: 7, title: '[claudinite-work] p/a', state: 'open', labels: ['task:status:running-agent'],
  body: 'packs/p/tasks/a/task.md\n', ...over,
});
const done = { issue: 7, outcome: 'done', summary: 'the run succeeded', pr: null };
const kinds = (ops) => ops.map((o) => o.kind);

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

test('a marked issue is never closed by its own run', () => {
  const marked = item({ title: 'Please add a dark mode', body: '<!-- claudinite-machine -->\npacks/p/tasks/a/task.md\n' });
  assert.ok(!kinds(convergeOps(marked, done)).includes('close'),
    'the terminal status stands on the open issue; closing it is the author\'s call');
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

test('canReachRepo reads the status, so a 403 with a plausible body is not a repo', async () => {
  const ok = async () => ({ status: 200, json: { full_name: 'o/r' } });
  // The exact body this session's proxy returns for a repo-scoped path.
  const proxied = async () => ({ status: 403, json: { message: 'GitHub access is not enabled for this session.' } });
  assert.equal(await canReachRepo(ok, 'o/r'), true);
  assert.equal(await canReachRepo(proxied, 'o/r'), false);
});
