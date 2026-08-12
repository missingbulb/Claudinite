import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  servedBy, servedByUpdates, servedByBaselining, withMechanism,
  MECHANISMS, DEFAULT_MECHANISM, MAINTENANCE, MECHANISM_KEY,
} from '../updates/served-by.mjs';

// The skew guard (#768's first risk): while both mechanisms exist, exactly one
// serves a repo. These are the cases that decide which — including the ones where
// the honest answer is "the repo did not say".

test('a repo that says nothing keeps doing what it does today', () => {
  assert.deepEqual(servedBy(undefined), { mechanism: 'baselining', declared: false });
  assert.deepEqual(servedBy({}), { mechanism: 'baselining', declared: false });
  assert.deepEqual(servedBy({ [MAINTENANCE]: {} }), { mechanism: 'baselining', declared: false });
  assert.equal(DEFAULT_MECHANISM, 'baselining', 'the default points at what is already true, never at the new thing');
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
  assert.equal(r.mechanism, DEFAULT_MECHANISM, 'and it falls back to the status quo, not the new flow');
  assert.equal(servedBy({ [MAINTENANCE]: { [MECHANISM_KEY]: 7 } }).invalid, 7);
});

test('exactly one mechanism serves a repo, whatever the declaration says', () => {
  // The property the whole flag exists for, asserted over every shape above rather
  // than trusted to two predicates that could drift apart.
  const shapes = [
    undefined, {}, { [MAINTENANCE]: {} },
    { [MAINTENANCE]: { [MECHANISM_KEY]: 'updates' } },
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
