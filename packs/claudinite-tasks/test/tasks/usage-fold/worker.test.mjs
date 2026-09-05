import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogName, parseEntries, USAGE_PATH,
  parseCommitLog, dayFieldsFrom, dayLadder, deepenHistory,
} from '../../../tasks/usage-fold/worker.mjs';
import { parseLogFilename, logFilename } from '../../../../claudinite-growth/capture-log.mjs';

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
    { date: '2026-07-28', stamp: '2026-07-28T09:40:00Z', issue: 9, sessionId: 's1' });
  assert.equal(parseLogName('2026-07-28T0940Z--issue-0--s1.jsonl').issue, 0);
  // The branch also carries its README; anything unparsable is simply not a capture.
  assert.equal(parseLogName('README.md'), null);
  assert.equal(parseLogName('notes.jsonl'), null);
});

test('parseEntries skips a partial trailing write instead of dropping the file', () => {
  const entries = parseEntries('{"type":"user"}\nnot json\n\n{"type":"assistant"}\n');
  assert.deepEqual(entries.map((e) => e.type), ['user', 'assistant']);
});

test('the aggregate lives under the repo-owned local root, never inside the mount', () => {
  // .claudinite/shared/ is re-vendored from canon on every refresh, so a file written
  // there would be silently reverted; .claudinite/local/ is the repo's own area.
  assert.ok(USAGE_PATH.startsWith('.claudinite/local/'), USAGE_PATH);
  assert.ok(USAGE_PATH.includes('GENERATED'), 'a machine-written file says so in its name');
});

// --- the local-git day series -----------------------------------------------------

test('parseCommitLog attributes each numstat block to the commit that opened it', () => {
  const log = [
    '\u00012026-08-21T10:00:00+00:00',
    '10\t2\tsrc/a.mjs',
    '4\t0\tsrc/b.mjs',
    '\u00012026-08-21T18:30:00+00:00',
    '1\t1\tREADME.md',
    '-\t-\tlogo.png',                    // a binary file moves no LINES
    '\u00012026-08-20T09:00:00+00:00',
    '\u00012026-08-20T11:00:00+00:00',    // a merge: a commit with no numstat of its own
    '7\t3\tsrc/c.mjs',
  ].join('\n');
  assert.deepEqual(parseCommitLog(log), {
    '2026-08-21': { commits: 2, linesAdded: 15, linesRemoved: 3 },
    '2026-08-20': { commits: 2, linesAdded: 7, linesRemoved: 3 },
  });
  assert.deepEqual(parseCommitLog(''), {});
});

test('dayFieldsFrom leaves days the history could not reach WITHOUT keys', () => {
  // The shallow-checkout case, which is the normal one in Actions: writing 0 for a day
  // the clone simply does not contain would draw a busy week as an idle one.
  const ladder = ['2026-08-18', '2026-08-19', '2026-08-20'];
  const fields = dayFieldsFrom({
    commits: { coveredFrom: '2026-08-19', days: { '2026-08-20': { commits: 2, linesAdded: 9, linesRemoved: 1 } } },
    releases: { days: { '2026-08-20': 1 } },
    ladder,
  });
  assert.equal(fields['2026-08-18'].commits, undefined, 'before the history starts — unknown');
  assert.equal(fields['2026-08-18'].releases, 0, 'but the releases listing did reach it');
  assert.deepEqual(fields['2026-08-19'], { commits: 0, linesAdded: 0, linesRemoved: 0, releases: 0 });
  assert.deepEqual(fields['2026-08-20'], { commits: 2, linesAdded: 9, linesRemoved: 1, releases: 1 });
});

test('dayFieldsFrom writes nothing at all when neither source could be read', () => {
  assert.deepEqual(dayFieldsFrom({ commits: null, releases: null, ladder: ['2026-08-20'] }), {});
});

test('dayLadder is a UTC ladder ending today', () => {
  const ladder = dayLadder('2026-08-21T11:00:00Z', 3);
  assert.deepEqual(ladder, ['2026-08-19', '2026-08-20', '2026-08-21']);
});

// --- the deepen that makes the line series answerable at all ----------------------

test('deepenHistory fetches the window on a shallow checkout — the normal Actions case', () => {
  const calls = [];
  const git = (root, args) => { calls.push(args); return args[0] === 'rev-parse' ? 'true\n' : ''; };
  assert.equal(deepenHistory(git, '/r', 'https://x/y', 'main', '2026-07-22T00:00:00Z'), 'deepened');
  assert.deepEqual(calls[1], ['fetch', '--quiet', '--shallow-since=2026-07-22T00:00:00Z', 'https://x/y', 'main']);
});

test('deepenHistory leaves a COMPLETE clone alone — the same flag would truncate it', () => {
  const calls = [];
  const git = (root, args) => { calls.push(args); return 'false\n'; };
  assert.equal(deepenHistory(git, '/r', 'https://x/y', 'main', '2026-07-22T00:00:00Z'), 'complete');
  assert.equal(calls.length, 1, 'it asks, and then does nothing at all');
});

test('a deepen that could not run says so, rather than passing for one that did', () => {
  // The series still reads whatever history is there and `coveredFrom` still states
  // where it starts — but a run where the deepen never engaged must not read in the
  // log like one where it did.
  const git = (root, args) => {
    if (args[0] === 'rev-parse') return 'true\n';
    throw new Error('the server will not deepen');
  };
  assert.equal(deepenHistory(git, '/r', 'https://x/y', 'main', '2026-07-22T00:00:00Z'), 'unchanged');
});

// The executor resolves which branch and pull request the fold lands on (DESIGN
// §6.4b) and hands it to code-work as environment; the worker passes it through to
// the lane and reads nothing of its own about open pull requests.
test('the fold hands the executor\'s target to the delivery lane', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../../tasks/usage-fold/worker.mjs', import.meta.url), 'utf8');
  const call = src.slice(src.indexOf('deliverGenerated({'));
  assert.match(call, /branch: process\.env\.CLAUDINITE_TARGET_BRANCH/);
  assert.match(call, /pr: .*CLAUDINITE_TARGET_PR/);
});
