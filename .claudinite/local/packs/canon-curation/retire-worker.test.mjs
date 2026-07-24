import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessRetirement } from './tasks/migrations-retire/worker.mjs';
import { retirableMigrationsByStamp } from '../../../../migrations/registry.mjs';

// The migrations-retire worker's DECISION core (per-project-scheduling DESIGN §6).
// Pure over an injected fleet + a `probe(member, migration)` — no live GitHub.
// Uses the REAL stamp guard so the two stay coupled.

const mig = (over = {}) => ({ id: 'm', landed: '2026-07-12', file: 'm.mjs', ...over });
const member = (over = {}) => ({ repo: 'acme/a', defaultBranch: 'main', stamp: { updated: '2026-07-14' }, ...over });
const clean = () => async () => false; // nobody on the legacy shape

const assess = (over) => assessRetirement({
  today: '2026-07-15', retirableByStamp: retirableMigrationsByStamp,
  migrations: [mig()], fleet: { members: [member()], unreadable: [] }, probe: clean(),
  ...over,
});

test('retires a fully-applied migration the whole fleet converged past', async () => {
  const r = await assess({ fleet: { members: [member({ repo: 'acme/a' }), member({ repo: 'acme/b' })], unreadable: [] } });
  assert.deepEqual(r.retirable.map((m) => m.id), ['m']);
  assert.equal(r.unknownCount, 0);
});

test('an unreadable member blocks all retirement', async () => {
  const r = await assess({ fleet: { members: [member()], unreadable: ['acme/flaky'] } });
  assert.equal(r.unknownCount, 1);
  assert.deepEqual(r.retirable, []);
});

test('a member with no provenance stamp is unknown — blocks retirement', async () => {
  const r = await assess({ fleet: { members: [member({ stamp: null })], unreadable: [] } });
  assert.equal(r.unknownCount, 1);
  assert.deepEqual(r.retirable, []);
});

test('a member still on the legacy shape blocks that migration (pending++)', async () => {
  const probe = async (m) => m.repo === 'acme/b'; // b still legacy
  const r = await assess({ fleet: { members: [member({ repo: 'acme/a' }), member({ repo: 'acme/b' })], unreadable: [] }, probe });
  assert.equal(r.pending.get('m'), 1);
  assert.deepEqual(r.retirable, []);
});

test('a probe error counts that member pending (an API hiccup delays, never triggers)', async () => {
  const probe = async (mem) => { if (mem.repo === 'acme/b') throw new Error('503'); return false; };
  const r = await assess({ fleet: { members: [member({ repo: 'acme/a' }), member({ repo: 'acme/b' })], unreadable: [] }, probe });
  assert.equal(r.pending.get('m'), 1);
  assert.deepEqual(r.retirable, []);
  assert.match(r.notes.join(' '), /probe on acme\/b errored/);
});

test('a member not converged past the landing day blocks (per-repo quiescence)', async () => {
  const r = await assess({ fleet: { members: [member({ repo: 'acme/a', stamp: { updated: '2026-07-14' } }), member({ repo: 'acme/b', stamp: { updated: '2026-07-11' } })], unreadable: [] } });
  assert.equal(r.unknownCount, 0);
  assert.deepEqual(r.retirable, []); // b's stamp predates the migration's landing day
});
