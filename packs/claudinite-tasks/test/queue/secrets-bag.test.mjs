// The executor's secret bag (#1301). The reader is the whole compatibility surface
// between an engine that converges nightly and an executor workflow that moves only
// by human-merged PR, so both shapes are pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretsBag, secretValue, secretsFor, SECRETS_BAG_ENV } from '../../queue/secrets-bag.mjs';

const bagEnv = (obj, rest = {}) => ({ ...rest, [SECRETS_BAG_ENV]: JSON.stringify(obj) });

test('the bag is read from the one env var the workflow sets', () => {
  assert.deepEqual(secretsBag(bagEnv({ A: '1' })), { A: '1' });
});

test('no bag, an empty one, a malformed one and a non-object all read as absent', () => {
  for (const env of [{}, { [SECRETS_BAG_ENV]: '' }, { [SECRETS_BAG_ENV]: '{oops' },
    { [SECRETS_BAG_ENV]: '["A"]' }, { [SECRETS_BAG_ENV]: 'null' }]) {
    assert.equal(secretsBag(env), null, JSON.stringify(env));
  }
});

// The window every member spends between this engine converging and its own
// executor workflow being merged. Getting this wrong is #1296 again.
test('a legacy stamping workflow still resolves: env wins when the bag has no such name', () => {
  assert.equal(secretValue('TOKEN', { TOKEN: 'legacy' }), 'legacy');
  assert.equal(secretValue('TOKEN', bagEnv({ OTHER: 'x' }, { TOKEN: 'legacy' })), 'legacy');
});

test('the bag wins over a same-named plain variable', () => {
  assert.equal(secretValue('TOKEN', bagEnv({ TOKEN: 'bagged' }, { TOKEN: 'legacy' })), 'bagged');
});

test('an unknown name is undefined under either shape', () => {
  assert.equal(secretValue('NOPE', bagEnv({ A: '1' })), undefined);
  assert.equal(secretValue('NOPE', {}), undefined);
});

// The tightening DESIGN §14.4 always claimed: a task sees what it declared, and the
// other secrets this job happens to carry are not its business.
test('secretsFor selects only the declared names', () => {
  const env = bagEnv({ A: '1', B: '2', C: '3' });
  assert.deepEqual(secretsFor(['A', 'C'], env), { A: '1', C: '3' });
  assert.deepEqual(secretsFor([], env), {});
  assert.deepEqual(secretsFor(undefined, env), {});
});

test('secretsFor leaves out what this job does not carry, keeping unset distinct from empty', () => {
  assert.deepEqual(secretsFor(['A', 'MISSING'], bagEnv({ A: '1', EMPTY: '' })), { A: '1' });
  assert.deepEqual(secretsFor(['EMPTY'], bagEnv({ EMPTY: '' })), { EMPTY: '' });
});

// The bag holds every secret the repository has. Handing it to a task's subprocess
// would undo the selection above in one variable.
test('the bag variable is never itself a selectable secret', () => {
  assert.deepEqual(secretsFor([SECRETS_BAG_ENV], bagEnv({ A: '1' })), {});
});
