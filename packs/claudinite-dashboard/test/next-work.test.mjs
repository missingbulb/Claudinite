import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  itemCandidate, reasonCandidate, rankCandidates, pickCandidate, fleetCandidates, repoCandidates,
} from '../next-work.mjs';
import { estimateMinutes, parkMinutes, parkMinutesNote } from '../fleet.mjs';
import {
  NEEDS_HUMAN, READY, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_APPROVAL, NEEDS_HUMAN_DECISION,
} from '../../../engine/scheduler/queue/work-item.mjs';

const item = (over = {}) => ({
  number: 7,
  title: '[claudinite-work] basics/baselining',
  key: 'basics/baselining',
  state: READY,
  warnings: [],
  idleMs: 3600e3,
  ...over,
});

const parked = (over = {}) => item({
  state: NEEDS_HUMAN,
  warnings: [{ level: 'serious', text: 'parked for a person' }],
  ...over,
});

test('an item nothing is wrong with is not a candidate', () => {
  assert.equal(itemCandidate('o/r', item()), null);
});

test('a parked item becomes a candidate carrying its issue link and its reason', () => {
  const c = itemCandidate('o/r', parked({ number: 12 }));
  assert.equal(c.kind, 'item');
  assert.equal(c.level, 'serious');
  assert.equal(c.why, 'parked for a person');
  assert.equal(c.url, 'https://github.com/o/r/issues/12');
});

test('a filed item shows no title — its key already says what it is', () => {
  assert.equal(itemCandidate('o/r', parked()).title, null);
  // A marked issue keeps the words a person wrote, and those are the point of it.
  assert.equal(itemCandidate('o/r', parked({ title: 'Rotate the signing key' })).title, 'Rotate the signing key');
});

test('the candidate carries the park\'s own classification, and no price', () => {
  assert.deepEqual(itemCandidate('o/r', parked({ triage: NEEDS_HUMAN_DECISION })).park,
    { blocking: false, triage: NEEDS_HUMAN_DECISION });
  assert.equal(itemCandidate('o/r', parked({ blockingPark: true })).park.blocking, true);
  // Not a park: an item tripping a recovery rule, and a repo-level fault. Both are
  // outside the attention estimate, so neither carries one here.
  assert.equal(itemCandidate('o/r', item({ warnings: [{ level: 'warning', text: 'leash blown' }] })).park, null);
  assert.equal(reasonCandidate('o/r', [{ kind: 'scheduler', level: 'critical', text: 'scheduler last run failed' }]).park, null);
});

test("one item's price is one term of the estimate's own sum", () => {
  const priceOf = (over) => parkMinutes(itemCandidate('o/r', parked(over)).park);
  assert.equal(priceOf({ blockingPark: true }), estimateMinutes({ broken: 1 }));
  assert.equal(priceOf({ triage: NEEDS_HUMAN_ACTION }), estimateMinutes({ actions: 1 }));
  assert.equal(priceOf({ triage: NEEDS_HUMAN_DECISION }), estimateMinutes({ decisions: 1 }));
  assert.equal(priceOf({ triage: NEEDS_HUMAN_APPROVAL }), estimateMinutes({ approvals: 1 }));
  // Nothing to price is null, never a zero.
  assert.equal(parkMinutes(null), null);
});

test('only an approval disclaims its figure, because only its size is unread', () => {
  const noteOf = (over) => parkMinutesNote(itemCandidate('o/r', parked(over)).park);
  assert.match(noteOf({ triage: NEEDS_HUMAN_APPROVAL }), /lower bound/);
  assert.equal(noteOf({ triage: NEEDS_HUMAN_DECISION }), null);
  assert.equal(noteOf({ blockingPark: true }), null);
  assert.equal(parkMinutesNote(null), null);
});

test('a blocking park is critical, and outranks an ordinary one', () => {
  const blocking = itemCandidate('o/r', parked({ number: 3, blockingPark: true }));
  assert.equal(blocking.level, 'critical');
  assert.equal(pickCandidate([itemCandidate('o/r', parked()), blocking]).number, 3);
});

test('a held lane is read from the row, which the item cannot state about itself', () => {
  const row = { nextAsk: { kind: 'held' } };
  assert.equal(itemCandidate('o/r', item(), row).level, 'critical');
  // Without the row there is nothing wrong with that same item at all.
  assert.equal(itemCandidate('o/r', item()), null);
});

test('an info-level fault is reported elsewhere and never prodded about', () => {
  assert.equal(reasonCandidate('o/r', [{ kind: 'mount', level: 'info', text: 'mount behind canon on basics' }]), null);
});

test('a repo-level fault with no item behind it is a candidate, at the repo', () => {
  const c = reasonCandidate('o/r', [
    { kind: 'ci', level: 'warning', text: 'CI failing' },
    { kind: 'scheduler', level: 'critical', text: 'scheduler last run failed' },
  ]);
  assert.equal(c.kind, 'repo');
  assert.equal(c.why, 'scheduler last run failed');
  assert.equal(c.url, 'https://github.com/o/r');
});

test('park reasons never become repo candidates — the item candidate says it with a link', () => {
  assert.equal(reasonCandidate('o/r', [{ kind: 'park', level: 'critical', text: '2 items parked broken' }]), null);
});

test('at one level an issue outranks a repo, and the longer-stuck issue outranks the fresher', () => {
  const fresh = itemCandidate('o/r', parked({ number: 2, idleMs: 60e3 }));
  const stale = itemCandidate('o/r', parked({ number: 1, idleMs: 9 * 86400e3 }));
  const repo = reasonCandidate('o/r', [{ kind: 'scheduler', level: 'serious', text: 'scheduler last run failed' }]);
  assert.deepEqual(rankCandidates([repo, fresh, stale]).map((c) => (c.kind === 'repo' ? 'repo' : c.number)),
    [1, 2, 'repo']);
  // And an issue whose age is unknown still outranks the repo it sits in: an unknown
  // age is not a fresh one, and only the issue carries a link to act through.
  const undated = itemCandidate('o/r', parked({ number: 8, idleMs: null }));
  assert.equal(rankCandidates([repo, undated])[0].number, 8);
});

test('nothing wrong anywhere is no candidate, not a made-up one', () => {
  assert.equal(pickCandidate([]), null);
  assert.equal(pickCandidate([null, null]), null);
});

test('a fleet ranks across its members, and skips the ones it could not read', () => {
  const summaries = [
    { repo: 'o/quiet', status: 'adopted', top: null, reasons: [] },
    { repo: 'o/loud', status: 'adopted', top: itemCandidate('o/loud', parked({ number: 5, blockingPark: true })), reasons: [] },
    { repo: 'o/hidden', status: 'unreadable', reasons: [{ level: 'info', text: 'not visible to you' }] },
    { repo: 'o/ci', status: 'adopted', top: null, reasons: [{ kind: 'ci', level: 'warning', text: 'CI failing' }] },
  ];
  const all = fleetCandidates(summaries);
  assert.equal(all[0].repo, 'o/loud');
  assert.equal(all[0].number, 5);
  assert.deepEqual(all.map((c) => c.repo), ['o/loud', 'o/ci']);
});

test('one repo ranks over the work table\'s own rows, so the block and the table agree', () => {
  const rows = [
    { key: 'basics/baselining', current: parked({ number: 9 }) },
    { key: 'basics/other', current: null },
    { key: 'basics/held', current: item({ number: 4 }), nextAsk: { kind: 'held' } },
  ];
  const ranked = repoCandidates('o/r', rows);
  assert.deepEqual(ranked.map((c) => c.number), [4, 9]);
});
