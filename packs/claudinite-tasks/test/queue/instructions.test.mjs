import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The routine's whole stored prompt is one line pointing at this file, so every
// step a queue session performs is here or nowhere. That makes it the one place a
// step can be lost SILENTLY: nothing imports it, no run fails without it, and the
// only symptom is an artifact that quietly stops being produced.
//
// The capture step was lost exactly that way. The slot executor's instructions
// carried it and the queue's did not (#974), which left every unattended session
// ending with its container reclaimed — the ending no `SessionEnd` hook fires on —
// so no transcript reached the logs branch. Downstream, the growth lifecycle's
// conversation half had nothing to mine and the usage fold's task-status census
// counted nothing, both of them reporting healthy while seeing an empty input.
const TEXT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../queue/instructions.md'),
  'utf8',
);

// The terminal transition is CODE the session calls, not a checklist it performs
// (#892, DESIGN §15.18): five ordered side effects done by hand at the end of a
// long run is how two live runs closed items wearing `task:agent`, or with no
// execution record at all. What this pins is that the instructions hand the
// mechanics to the command and keep only the judgment.
test('a queue session converges through the command, not by hand', () => {
  assert.match(TEXT, /converge-item\.mjs/, 'names the converge command');
  assert.match(TEXT, /--outcome done\|approval\|action\|decision\|failure/, 'and its outcome vocabulary');
  assert.doesNotMatch(TEXT, /record-exec\.mjs/,
    'the item carries its own record now — a session that also prints one double-counts it');
});

test('a queue session is told to capture itself, with the item as the issue', () => {
  assert.match(TEXT, /session-end-command\.mjs/, 'names the session-end runner');
  assert.match(TEXT, /CLAUDINITE_SESSION_ISSUE=<n>/,
    'and passes the item number, so the logs file under the task that ran rather than under nothing');
});

test('capture comes after convergence, and runs whichever way the work went', () => {
  const converge = TEXT.indexOf('Converge the issue exactly once');
  const capture = TEXT.indexOf('Capture this session before you end it');
  assert.ok(converge !== -1 && capture > converge,
    'capture must be the last step — it cannot be allowed to fail a run that already converged');
  assert.match(TEXT.slice(capture), /whichever way/,
    'a failed run is the one most worth having a record of');
});

test('the instructions carry no slot vocabulary', () => {
  // The queue has one occurrence identity, the issue number. A session told about
  // a slot id would go looking for a field no item has.
  assert.doesNotMatch(TEXT, /\bslot\b/i);
});
