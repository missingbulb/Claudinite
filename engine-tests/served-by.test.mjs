import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  servedBy, servedByUpdates, servedByBaselining, withMechanism,
  MECHANISMS, DEFAULT_MECHANISM, RETIRED_MECHANISM, LEGACY_MECHANISM, VERSIONED_MECHANISM, MAINTENANCE, MECHANISM_KEY,
} from '../engine/served-by.mjs';

// The skew guard (#768's first risk), now the record of a finished rollout. It kept
// two mechanisms off one mount; Phase 5 retired baselining, so the default moved with
// the fact. These are the cases that decide which mechanism serves a repo — including
// the ones where the honest answer is "the repo did not say".

test('a repo that says nothing gets the only mechanism there is, by its current name', () => {
  for (const shape of [undefined, {}, { [MAINTENANCE]: {} }]) {
    assert.deepEqual(servedBy(shape), { mechanism: VERSIONED_MECHANISM, declared: false });
  }
});

test('the renamed mechanism answers to BOTH spellings while the record drains', () => {
  // A member reads its own declaration with the engine it currently has, which is one
  // cycle behind the record that renames it. If the old spelling stopped parsing the
  // moment the record landed, a correctly-declared repo would read as `invalid` — and
  // `invalid` means "undeclared, with the offending value attached", so a repo that
  // did nothing wrong would be reported as misdeclared for exactly one cycle.
  const declaring = (m) => ({ [MAINTENANCE]: { [MECHANISM_KEY]: m } });
  for (const m of [LEGACY_MECHANISM, VERSIONED_MECHANISM]) {
    assert.deepEqual(servedBy(declaring(m)), { mechanism: m, declared: true },
      `${m} must parse as itself, not be normalised away`);
    assert.equal(servedByUpdates(declaring(m)), true, `${m} is served by the update flows`);
    assert.equal(servedByBaselining(declaring(m)), false);
  }
  // Distinct from RETIRED: the legacy name is fully SERVED, just spelled the old way.
  assert.equal(servedByUpdates(declaring(RETIRED_MECHANISM)), false, 'retired is not merely a spelling');
});

test('the retired mechanism still PARSES — a stale declaration is read, not reinterpreted', () => {
  // A repo whose mount predates the flip, or was restored from a backup, can still
  // say `baselining`. Reading that as anything else would hand it to a mechanism its
  // owner never chose, so it stays a recognised value that reports itself declared —
  // and the flows refuse to serve it rather than pretending it means `updates`.
  assert.deepEqual(servedBy({ [MAINTENANCE]: { [MECHANISM_KEY]: RETIRED_MECHANISM } }),
    { mechanism: 'baselining', declared: true });
  assert.equal(servedByUpdates({ [MAINTENANCE]: { [MECHANISM_KEY]: RETIRED_MECHANISM } }), false);
});

test('a declared mechanism is taken, and reported as declared', () => {
  for (const m of MECHANISMS) {
    assert.deepEqual(servedBy({ [MAINTENANCE]: { [MECHANISM_KEY]: m } }), { mechanism: m, declared: true });
  }
});

test('an unrecognised value is undeclared and carries what it said — never a silent default', () => {
  // The one case where guessing could hand a repo to the wrong mechanism. It reads as
  // "not declared" so a caller that cares can stop, and it keeps the offending value
  // so the report can name it.
  const r = servedBy({ [MAINTENANCE]: { [MECHANISM_KEY]: 'both' } });
  assert.equal(r.declared, false);
  assert.equal(r.invalid, 'both');
  assert.equal(r.mechanism, DEFAULT_MECHANISM, 'and it falls back to the default, never to a guess');
  assert.equal(servedBy({ [MAINTENANCE]: { [MECHANISM_KEY]: 7 } }).invalid, 7);
});

test('exactly one mechanism serves a repo, whatever the declaration says', () => {
  // The property the whole flag exists for, asserted over every shape above rather
  // than trusted to two predicates that could drift apart.
  const shapes = [
    undefined, {}, { [MAINTENANCE]: {} },
    { [MAINTENANCE]: { [MECHANISM_KEY]: 'updates' } },
    { [MAINTENANCE]: { [MECHANISM_KEY]: 'versioned' } },
    { [MAINTENANCE]: { [MECHANISM_KEY]: 'baselining' } },
    { [MAINTENANCE]: { [MECHANISM_KEY]: 'nonsense' } },
    { [MAINTENANCE]: { delivery: 'auto-merge' } },
  ];
  for (const s of shapes) {
    assert.notEqual(servedByUpdates(s), servedByBaselining(s), JSON.stringify(s));
  }
});

test('the flip writes the mechanism explicitly and touches nothing else', () => {
  const before = { packs: ['basics'], [MAINTENANCE]: { delivery: 'auto-merge' }, claudinite: { engineVersion: 2 } };
  const after = withMechanism(before, 'updates');
  assert.equal(after[MAINTENANCE][MECHANISM_KEY], 'updates');
  assert.equal(after[MAINTENANCE].delivery, 'auto-merge', 'the sibling setting survives');
  assert.deepEqual(after.packs, ['basics']);
  assert.deepEqual(after.claudinite, { engineVersion: 2 });
  assert.equal(before[MAINTENANCE][MECHANISM_KEY], undefined, 'and the input is not mutated');
  // Declared, and now readable as such — which is what makes the inferred case above
  // a piece of drift an update can repair rather than a state code interprets forever.
  assert.deepEqual(servedBy(after), { mechanism: 'updates', declared: true });
});

test('the flip refuses a mechanism that does not exist', () => {
  assert.throws(() => withMechanism({}, 'whatever'), /unknown mechanism/);
});
