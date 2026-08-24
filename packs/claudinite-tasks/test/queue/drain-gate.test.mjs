// THE DRAIN GATE (tasks-dispatch DESIGN §15.30). Every workflow run is a billed
// Actions invocation whatever it finds — each job's minutes rounded UP — so the
// hourly drain, dispatched into an empty queue, cost a full invocation to find
// nothing: 24 of them a day on a quiet repo.
//
// The gate has two halves in two artifacts, and each can rot without the other
// saying anything: the scheduler run WRITES what it left pickable, and the drain
// job's `if` READS it. A knob stamped into no workflow is one nobody can turn; a
// knob no workflow reads is one that looks live and does nothing (#974). Both
// halves are pinned here, in both copies of the workflow — the canon's own and
// the stub it ships, which drift apart silently otherwise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANON = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (p) => readFileSync(join(CANON, p), 'utf8');
const WORKFLOWS = [
  '.github/workflows/claudinite-scheduler.yml',
  'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
];

test('the scheduler run writes the pickable verdict, and the drain job gates on it', () => {
  assert.match(read('packs/claudinite-tasks/queue/scheduler-run.mjs'), /pickable=\$\{pickable\.length \? 'true' : 'false'\}/,
    'the producer no longer writes the output the drain job reads');
  for (const wf of WORKFLOWS) {
    const s = read(wf);
    assert.match(s, /outputs:\s*\n\s*pickable: \$\{\{ steps\.run\.outputs\.pickable \}\}/, `${wf}: the job does not surface the step's output`);
    assert.match(s, /if: needs\.scheduler-run\.outputs\.pickable == 'true'/, `${wf}: the drain is not gated`);
  }
});

// The step's `id` is what makes `steps.run.outputs` resolvable at all. A rename
// leaves a job output that is always the empty string — no error, no drain, and
// nothing red: exactly the silent-death shape this file exists to prevent.
test('the step the job output reads from carries the id it names', () => {
  for (const wf of WORKFLOWS) {
    const step = read(wf).split('steps:')[1];
    assert.match(step, /\n\s*id: run\n/, `${wf}: no step is named \`run\``);
  }
});

// A SKIPPED DEPENDENCY IS NOT A FAILED ONE. Once the drain can be skipped, a bare
// `failure()` on the job that reports a broken run makes its fate turn on how the
// platform propagates a skipped `needs` — so the condition names the results it
// actually means, and a quiet hour cannot silence the failure report.
test('the failure report survives a skipped drain by naming the results it means', () => {
  for (const wf of WORKFLOWS) {
    const s = read(wf);
    assert.match(s, /needs\.scheduler-run\.result == 'failure'/, wf);
    assert.match(s, /needs\.drain\.result == 'failure'/, wf);
    assert.doesNotMatch(s, /\n\s*if: failure\(\)\n/, `${wf}: a bare failure() is left where a skip can reach it`);
  }
});

// THE GATE MUST BE THE RUN'S LAST ACT. A forced wake (`CLAUDINITE_WAKE`) readies
// items at the very end of the run, and a look taken before it reports an empty
// queue — sending the hour's forced work to the next cron fire, which is the one
// thing a force exists not to wait for.
test('the pickable look happens after the forced wake, not before it', () => {
  const src = read('packs/claudinite-tasks/queue/scheduler-run.mjs');
  const main = src.slice(src.indexOf('async function main() {'));
  const wake = main.indexOf('CLAUDINITE_WAKE');
  const gate = main.indexOf('announcePickable(');
  assert.ok(wake > 0 && gate > wake, 'the drain gate is evaluated before the wake it must see');
});

// A member holding an OLDER copy of this workflow maps no such output, and an
// empty string is not `'true'`… which would skip its drain forever. The gate is
// therefore written so a stale copy keeps its previous behaviour: the `if` lives
// on the drain job in the NEW copy only, and the engine's own half is inert
// without it — a run that cannot write the output says which happened rather
// than going quiet.
test('the producer is inert where nothing consumes it', () => {
  const src = read('packs/claudinite-tasks/queue/scheduler-run.mjs');
  assert.match(src, /const out = process\.env\.GITHUB_OUTPUT;\s*\n\s*if \(!out\) return;/,
    'the run must not fail where GITHUB_OUTPUT is unavailable');
  assert.match(src, /console\.log\(pickable\.length/, 'the verdict is not on the record');
});
