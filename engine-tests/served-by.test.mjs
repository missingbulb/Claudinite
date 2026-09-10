import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  servedBy, servedByUpdates, servedByBaselining, withMechanism,
  MECHANISMS, DEFAULT_MECHANISM, RETIRED_MECHANISM, VERSIONED_MECHANISM, MAINTENANCE, MECHANISM_KEY,
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

test('the pre-rename spelling is out of the vocabulary, and the repo carrying it is still served', () => {
  // The alias retired with #1643, a convergence window after the `basics` record took
  // the old spelling out of declarations. The repo that somehow still says it is not
  // WEDGED by that: `updates` reads as invalid, invalid resolves to the default, and
  // the default is `versioned` — the mechanism that repo meant all along. What it
  // loses is `declared`, which is the honest report of a value nothing recognises.
  const declaring = (m) => ({ [MAINTENANCE]: { [MECHANISM_KEY]: m } });
  const stale = servedBy(declaring('updates'));
  assert.equal(stale.declared, false);
  assert.equal(stale.invalid, 'updates');
  assert.equal(stale.mechanism, VERSIONED_MECHANISM);
  assert.equal(servedByUpdates(declaring('updates')), true, 'and the update flows still run there');

  assert.deepEqual(servedBy(declaring(VERSIONED_MECHANISM)), { mechanism: VERSIONED_MECHANISM, declared: true });
  assert.equal(servedByUpdates(declaring(VERSIONED_MECHANISM)), true);
  assert.equal(servedByBaselining(declaring(VERSIONED_MECHANISM)), false);
  // Distinct from RETIRED, which parses and is deliberately NOT served.
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
  const after = withMechanism(before, VERSIONED_MECHANISM);
  assert.equal(after[MAINTENANCE][MECHANISM_KEY], VERSIONED_MECHANISM);
  assert.equal(after[MAINTENANCE].delivery, 'auto-merge', 'the sibling setting survives');
  assert.deepEqual(after.packs, ['basics']);
  assert.deepEqual(after.claudinite, { engineVersion: 2 });
  assert.equal(before[MAINTENANCE][MECHANISM_KEY], undefined, 'and the input is not mutated');
  // Declared, and now readable as such — which is what makes the inferred case above
  // a piece of drift an update can repair rather than a state code interprets forever.
  assert.deepEqual(servedBy(after), { mechanism: VERSIONED_MECHANISM, declared: true });
});

test('the flip refuses a mechanism that does not exist', () => {
  assert.throws(() => withMechanism({}, 'whatever'), /unknown mechanism/);
});
