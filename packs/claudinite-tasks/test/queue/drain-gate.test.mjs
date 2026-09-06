// THE DRAIN GATE (tasks-dispatch DESIGN §15.30). Every workflow run is a billed
// Actions invocation whatever it finds — each job's minutes rounded UP — so the
// hourly drain, dispatched into an empty queue, cost a full invocation to find
// nothing: 24 of them a day on a quiet repo. What is pinned here is the verdict
// the gate reads (`pickableCount`) and, in both copies of the workflow — the
// canon's own and the stub it ships — that the job output the gate reads is one
// a declared step actually writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pickableCount } from '../../queue/scheduler-run.mjs';

const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (p) => readFileSync(join(CANON, p), 'utf8');
const WORKFLOWS = [
  '.github/workflows/claudinite-scheduler.yml',
  'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
];

// A `steps.<id>.outputs.*` reference whose step has been renamed leaves a job
// output that is always the empty string — no error, no drain, and nothing red:
// exactly the silent-death shape this file exists to prevent. The two halves are
// in one artifact, so they are held to each other rather than to a spelling.
test('every step output a workflow reads is written by a step it declares', () => {
  for (const wf of WORKFLOWS) {
    const text = read(wf);
    const declared = new Set([...text.matchAll(/^\s*id:\s*([\w-]+)\s*$/gm)].map((m) => m[1]));
    const referenced = [...text.matchAll(/steps\.([\w-]+)\.outputs\./g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, `${wf}: the drain gate reads no step output at all`);
    for (const id of referenced) assert.ok(declared.has(id), `${wf}: steps.${id}.outputs is read but no step is named \`${id}\``);
  }
});

// THE GATE READS A QUEUE THAT DOES NOT YET CONTAIN WHAT THIS RUN JUST WROTE.
// GitHub's issue list is eventually consistent: a create returning #304 is not
// necessarily in the next list response, and the gate's look is milliseconds
// behind its own writes (#1340 — 377ms on LaughCounter, 584ms on the canary).
// The run then reports an empty queue, skips the drain, and the item it just
// minted sits `task:ready` until the next cron fire — which is precisely what a
// forced wake exists not to wait for. So the verdict is the UNION of what the
// list returns with what this run itself left ready: the run knows what it
// wrote, and that knowledge does not need a read to confirm it.
test('an item this run readied counts even when the list read has not caught up', () => {
  const open = [];
  assert.equal(pickableCount(open, [304], {}), 1,
    'a just-created ready item invisible to the list read must still open the drain gate');
});

test('an item both listed and readied by this run is counted once', () => {
  const open = [{ number: 304, labels: [{ name: 'task:ready' }], title: '[claudinite-work] a/b' }];
  assert.equal(pickableCount(open, [304], {}), 1, 'the union double-counted');
});

// The gate's whole purpose survives: a quiet run still dispatches nothing.
test('a run that readied nothing over an empty queue stays shut', () => {
  assert.equal(pickableCount([], [], {}), 0, 'the gate no longer saves the empty invocation');
});
