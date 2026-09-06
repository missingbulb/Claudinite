import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySeed, withSeeds, SET,
} from '../../../tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs';

// The pack-seed sweep's whole judgement is `classifySeed` plus the one edit — both
// pure, so every branch is exercised here without a network. This is the one sweep in
// the pack that WRITES to a member, and each test below pins one of the reasons it is
// safe to. Every fixture names a made-up pack: the sweep must be indifferent to which.

const SEED = { id: 'some-pack', config: { repo: 'o/store' } };
const classify = (over) => classifySeed({ config: { packs: [] }, seed: SEED, vendored: true, ...over });
const decl = (o) => `${JSON.stringify(o, null, 2)}\n`;

test('a member already declaring the pack is read and left alone', () => {
  // Declared with a config of its own: converged, and the config is NOT compared —
  // the fleet's list is a floor ("this pack, with these parameters if you have none"),
  // never an override.
  const own = classify({ config: { packs: [{ id: SEED.id, config: { repo: 'o/its-own' } }] } });
  assert.equal(own.state, SET);
  assert.match(own.detail, /its own config/);
  // Declared bare, with a seed that carries no config: nothing is owed.
  assert.equal(classifySeed({ config: { packs: [SEED.id] }, seed: { id: SEED.id }, vendored: true }).state, SET);
});

test('a member without the pack is writable, and says which case it was', () => {
  const missing = classify({});
  assert.equal(missing.state, 'writable');
  assert.match(missing.detail, /does not declare/);

  // Declared bare while the seed carries a config: the config is still owed, and
  // completing an entry is a different act from adding one.
  const bare = classify({ config: { packs: [SEED.id] } });
  assert.equal(bare.state, 'writable');
  assert.match(bare.detail, /with no config/);
});

test('the mount gate outranks the write — a member is never handed a pack it does not have', () => {
  // A declared pack whose code is absent is a blocking `config` error there, and a
  // member's mount carries only what it declared as of its last converge. So this is a
  // WAIT: members converge nightly and are written the first run after the pack lands.
  const v = classify({ vendored: false });
  assert.equal(v.state, 'not-vendored');
  assert.match(v.detail, /blocking config error/);
  assert.equal(classify({ vendored: false, config: { packs: [SEED.id] } }).state, 'not-vendored');
  // But a member already converged is never gated: nothing is being written.
  assert.equal(classify({ vendored: false, config: { packs: [{ id: SEED.id, config: {} }] } }).state, SET);
});

// --- the edit -----------------------------------------------------------------

test('withSeeds: declares the pack, keeps everything else, writes canonical settings', () => {
  const before = decl({ packs: ['basics'], maintenance: { delivery: 'auto-merge' } });
  const after = withSeeds(before, [SEED]);
  const parsed = JSON.parse(after);
  assert.deepEqual(parsed.packs[0], 'basics', 'the packs already declared survive, in order');
  assert.deepEqual(parsed.packs[1], { id: SEED.id, config: { repo: 'o/store' } });
  assert.deepEqual(parsed.maintenance, { delivery: 'auto-merge' });
  // 2-space with a trailing newline — the shape `--init` writes, because the file is
  // round-tripped through JSON rather than edited as text.
  assert.equal(after, decl(parsed));
  // Idempotent: running it again changes nothing at all.
  assert.equal(withSeeds(after, [SEED]), after);
});

test('withSeeds: completes an existing entry in place, and never touches a config the repo set', () => {
  const before = decl({ packs: ['basics', { id: SEED.id, answers: { store: 'n/a' } }, 'product-wiki'] });
  const parsed = JSON.parse(withSeeds(before, [SEED]));
  assert.equal(parsed.packs.length, 3, 'the entry is completed, never duplicated');
  assert.deepEqual(parsed.packs[1], { id: SEED.id, config: { repo: 'o/store' }, answers: { store: 'n/a' } },
    'its position and its recorded answer survive');

  // A config the repo already chose is that repo's decision — untouched, whatever the
  // seed says.
  const chosen = decl({ packs: [{ id: SEED.id, config: { repo: 'o/mine' } }] });
  assert.equal(withSeeds(chosen, [SEED]), chosen);

  // A bare declaration plus a seed with no config: nothing to add, nothing rewritten.
  const bare = decl({ packs: [SEED.id] });
  assert.equal(withSeeds(bare, [{ id: SEED.id }]), bare);
});

test('withSeeds: applies every seed handed to it, in one pass', () => {
  const parsed = JSON.parse(withSeeds(decl({ packs: [] }), [SEED, { id: 'other-pack' }]));
  assert.deepEqual(parsed.packs, [{ id: SEED.id, config: { repo: 'o/store' } }, 'other-pack']);
});

test('withSeeds: refuses a declaration that is not a settings object', () => {
  for (const bad of ['[]', 'null', '"text"']) {
    assert.throws(() => withSeeds(bad, [SEED]), /not a JSON object/, bad);
  }
  assert.throws(() => withSeeds('{oops', [SEED]));
});
