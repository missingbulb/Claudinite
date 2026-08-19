import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCandidates, undeclaredFits, localFits } from '../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-add-missing-packs/fingerprint-fit.mjs';

// The one-repo half of the pack-fit question, tested with SYNTHETIC packs on purpose:
// the module is pack-agnostic, and a test that reached for real canon packs would
// couple this test to whichever packs happen to carry a fingerprint today.

const pack = (id, over = {}) => ({ id, detect: () => false, local: false, ...over });

// --- candidacy ----------------------------------------------------------------

test('fitCandidates: only undeclared canon packs that carry a fingerprint', () => {
  const packs = [
    pack('has-fingerprint'),
    pack('declaration-authoritative', { detect: null }),
    pack('already-declared'),
    pack('a-local-pack', { local: true }),
  ];
  // Dropped, each for its own reason: already declared; declaration-authoritative
  // (detect: null); a local pack, which is declared by hand and never fingerprinted.
  assert.deepEqual(fitCandidates(packs, ['already-declared']).map((p) => p.id), ['has-fingerprint']);
});

test('fitCandidates: a declaration entry may be an object, not just a string', () => {
  // .claudinite-checks.json carries both shapes; a pack declared with config must not
  // be recommended back to the repo that already declares it.
  const packs = [pack('configured')];
  assert.deepEqual(fitCandidates(packs, [{ id: 'configured', config: {} }]), []);
});

test('fitCandidates: a pack with detect:null is never a candidate, declared or not', () => {
  // Declaration is authoritative in BOTH directions for these — their absence from a
  // declaration says nothing at all, so suspecting them would be noise by construction.
  assert.deepEqual(fitCandidates([pack('prose-only', { detect: null })], []), []);
});

// --- the three verdicts -------------------------------------------------------

test('undeclaredFits: true is a fit, false is silence, null is undecided', async () => {
  const packs = [pack('matches'), pack('does-not'), pack('cannot-tell')];
  const verdicts = { matches: true, 'does-not': false, 'cannot-tell': null };
  const res = await undeclaredFits({ packs, declared: [], evaluate: (p) => verdicts[p.id] });
  assert.deepEqual(res.fits, ['matches']);
  assert.deepEqual(res.undecided.map((u) => u.id), ['cannot-tell']);
});

test('undeclaredFits: an evaluator may explain WHY it could not decide', async () => {
  const res = await undeclaredFits({
    packs: [pack('greps-source')],
    evaluate: () => ({ verdict: null, why: 'wanted 400 file reads' }),
  });
  assert.deepEqual(res.fits, []);
  assert.equal(res.undecided[0].why, 'wanted 400 file reads');
});

test('undeclaredFits: a fingerprint that throws is undecided, never a clean fleet', async () => {
  // The failure this guards: a broken predicate returning nothing looks exactly like
  // "this repo needs nothing", and a sweep would report the fleet as fitted.
  const res = await undeclaredFits({
    packs: [pack('broken', { detect() { throw new Error('boom'); } })],
    evaluate: (p) => p.detect(),
  });
  assert.deepEqual(res.fits, []);
  assert.match(res.undecided[0].why, /fingerprint threw: boom/);
});

test('undeclaredFits: awaits an async evaluator (the remote caller reads over the network)', async () => {
  const res = await undeclaredFits({
    packs: [pack('remote')],
    evaluate: async () => true,
  });
  assert.deepEqual(res.fits, ['remote']);
});

test('undeclaredFits: both lists come back sorted, so a converged issue body is stable', async () => {
  // The fit issue is rewritten when its body changes; unstable ordering would rewrite
  // it every week and bury the real changes.
  const packs = [pack('zulu'), pack('alpha'), pack('yankee'), pack('bravo')];
  const res = await undeclaredFits({
    packs,
    evaluate: (p) => (p.id.length === 5 && p.id < 'm' ? true : null),
  });
  assert.deepEqual(res.fits, ['alpha', 'bravo']);
  assert.deepEqual(res.undecided.map((u) => u.id), ['yankee', 'zulu']);
});

// --- the local answer ---------------------------------------------------------

test('localFits: a real ctx decides every fingerprint — nothing is deferred', async () => {
  const ctx = { tracked: ['package.json', 'src/a.ts'], read: () => 'contents' };
  const packs = [
    pack('by-path', { detect: (c) => c.tracked.includes('package.json') }),
    pack('by-content', { detect: (c) => c.read('src/a.ts').includes('contents') }),
    pack('absent', { detect: (c) => c.tracked.includes('firebase.json') }),
  ];
  const res = await localFits({ ctx, packs, declared: [] });
  assert.deepEqual(res.fits, ['by-content', 'by-path']);
  assert.deepEqual(res.undecided, []);
});
