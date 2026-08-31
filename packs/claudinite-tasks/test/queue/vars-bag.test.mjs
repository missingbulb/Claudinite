// The executor's repository-variable bag (#1492). The secrets bag next door is the
// twin to read against: same parse, deliberately different precedence, and the same
// obligation to stay uneventful across the window a member spends between this engine
// converging and its own executor workflow being merged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { varsBag, varsEnv, VARS_BAG_ENV } from '../../queue/vars-bag.mjs';

const bagEnv = (obj, rest = {}) => ({ ...rest, [VARS_BAG_ENV]: JSON.stringify(obj) });

test('the bag is read from the one env var the workflow sets', () => {
  assert.deepEqual(varsBag(bagEnv({ A: '1' })), { A: '1' });
});

test('no bag, an empty one, a malformed one and a non-object all read as absent', () => {
  for (const env of [{}, { [VARS_BAG_ENV]: '' }, { [VARS_BAG_ENV]: '{oops' },
    { [VARS_BAG_ENV]: '["A"]' }, { [VARS_BAG_ENV]: 'null' }]) {
    assert.equal(varsBag(env), null, JSON.stringify(env));
  }
});

// The window a member spends running this engine against an executor workflow that
// still names its variables and sets no bag. Nothing to unpack is not a fault.
test('no bag contributes nothing rather than throwing', () => {
  assert.deepEqual(varsEnv({ CLAUDINITE_TASKS_SUSPEND_ALL: 'true' }), {});
});

test('the bag contributes every name it carries', () => {
  assert.deepEqual(varsEnv(bagEnv({ A: '1', B: '2' })), { A: '1', B: '2' });
});

// THE PRECEDENCE THAT DIFFERS FROM THE SECRETS BAG, and the reason this module is
// not a copy of it. A repo variable is not required to be a name anyone vetted, so a
// repo defining `PATH` or `HOME` must not be able to reach into a task subprocess and
// replace the runner's own.
test('a bagged variable never overwrites a name the environment already carries', () => {
  assert.deepEqual(varsEnv(bagEnv({ PATH: '/nope', NEW: 'x' }, { PATH: '/usr/bin' })),
    { NEW: 'x' });
});

// Otherwise one variable re-exports the whole blob under its own name.
test('the bag variable is not itself a variable the bag can deliver', () => {
  assert.deepEqual(varsEnv(bagEnv({ [VARS_BAG_ENV]: 'recursive', A: '1' })), { A: '1' });
});
