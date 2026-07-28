import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogName, parseEntries, withMergeAttribute, MERGE_ATTR, USAGE_PATH,
} from '../../../../packs/grow_with_claudinite/tasks/usage-fold/worker.mjs';
import { parseLogFilename, logFilename } from '../../../../packs/grow_with_claudinite/capture-log.mjs';

// The worker's I/O shell is exercised by the live run, not by a unit test (it fetches
// a branch and opens a PR). What IS unit-testable is where it AGREES with something
// else — and every one of those agreements is a place two files could silently drift.

test('parseLogName agrees with the capture step that writes the name', () => {
  // The drift guard that matters most here: capture-log.mjs writes these filenames,
  // this worker parses them, and neither imports the other (the fold must stay
  // runnable from its own task dir). A format change on either side would otherwise
  // make the fold silently see zero files and report a fleet-wide zero as fact.
  for (const [issue, session] of [[123, 'abc-def'], [0, 'sess-1'], [7, 'a-b-c-d-e']]) {
    const name = logFilename('2026-07-28T09:40:00.000Z', issue, session);
    const mine = parseLogName(name);
    const theirs = parseLogFilename(name);
    assert.ok(mine, `the fold must parse ${name}`);
    assert.equal(mine.issue, theirs.issue);
    assert.equal(mine.sessionId, theirs.sessionId);
    assert.equal(mine.date, theirs.capturedAt.slice(0, 10));
  }
});

test('parseLogName takes the collision suffix and the issue-0 form, and rejects everything else', () => {
  assert.deepEqual(parseLogName('2026-07-28T0940Z-2--issue-9--s1.jsonl'),
    { date: '2026-07-28', issue: 9, sessionId: 's1' });
  assert.equal(parseLogName('2026-07-28T0940Z--issue-0--s1.jsonl').issue, 0);
  // The branch also carries its README; anything unparsable is simply not a capture.
  assert.equal(parseLogName('README.md'), null);
  assert.equal(parseLogName('notes.jsonl'), null);
});

test('parseEntries skips a partial trailing write instead of dropping the file', () => {
  const entries = parseEntries('{"type":"user"}\nnot json\n\n{"type":"assistant"}\n');
  assert.deepEqual(entries.map((e) => e.type), ['user', 'assistant']);
});

test('withMergeAttribute declares the GENERATED merge driver once, and only once', () => {
  assert.equal(withMergeAttribute(null), `${MERGE_ATTR}\n`);
  assert.equal(withMergeAttribute('*.png binary'), `*.png binary\n${MERGE_ATTR}\n`);
  assert.equal(withMergeAttribute(`*.png binary\n${MERGE_ATTR}\n`), null, 'already declared — nothing to write');
});

test('the aggregate lives under the repo-owned local root, never inside the mount', () => {
  // .claudinite/shared/ is re-vendored from canon on every refresh, so a file written
  // there would be silently reverted; .claudinite/local/ is the repo's own area.
  assert.ok(USAGE_PATH.startsWith('.claudinite/local/'), USAGE_PATH);
  assert.ok(USAGE_PATH.includes('GENERATED'), 'a machine-written file says so in its name');
});
