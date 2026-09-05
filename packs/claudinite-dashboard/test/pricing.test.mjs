import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceModel, priceWindow, tokensByModelOver, modelTokens } from '../pricing.mjs';

// A million of each counter, so a rate reads straight out of the arithmetic.
const M = 1e6;
const counters = (over = {}) => ({ input: 0, cacheRead: 0, cacheCreate: 0, output: 0, ...over });
const opus = { in: 15, cacheRead: 1.5, out: 75 };

test('a model is priced per counter, at USD per million tokens', () => {
  assert.equal(priceModel(counters({ input: M, output: M }), opus), 90);
  assert.equal(priceModel(counters({ cacheRead: 2 * M }), opus), 3);
});

test('cache creation falls back to the input rate, and a stated cacheWrite wins', () => {
  // A cache-creation token is an input token the provider chose to charge differently.
  // A deployment that has not said how is better served by the input rate than by a
  // zero, which would price a cache-heavy day at nothing.
  assert.equal(priceModel(counters({ cacheCreate: M }), opus), 15);
  assert.equal(priceModel(counters({ cacheCreate: M }), { ...opus, cacheWrite: 18.75 }), 18.75);
});

test('a rate naming a model but not every counter prices NOTHING for it', () => {
  // A partial sum reads as a total and understates it silently — the one failure this
  // module exists to prevent.
  assert.equal(priceModel(counters({ input: M, output: M }), { in: 15 }), null);
  assert.equal(priceModel(counters({ input: M }), null), null);
});

test('tokensByModelOver sums a window, and says whether anything recorded a split', () => {
  const rows = [
    { tokensByModel: { a: counters({ input: 10, output: 1 }) } },
    { tokensByModel: { a: counters({ input: 5 }), b: counters({ output: 2 }) } },
    { tokensIn: 99 },                                    // a day that predates the field
  ];
  const { models, recorded } = tokensByModelOver(rows);
  assert.deepEqual(models.a, counters({ input: 15, output: 1 }));
  assert.deepEqual(models.b, counters({ output: 2 }));
  assert.equal(recorded, true);
  // A window of rows that ALL predate the field is *not recorded* — a different
  // sentence from unpriced, and a very different one from zero.
  assert.equal(tokensByModelOver([{ tokensIn: 99 }]).recorded, false);
  assert.equal(tokensByModelOver([]).recorded, false);
  assert.equal(modelTokens(counters({ input: 1, cacheRead: 2, cacheCreate: 3, output: 4 })), 10);
});

test('an unrated model is an unpriced REMAINDER, never folded into the sum', () => {
  const rows = [{ tokensByModel: { opus: counters({ input: M }), mystery: counters({ output: 3 * M }) } }];
  const out = priceWindow(rows, { opus });
  assert.equal(out.usd, 15, 'the rated model is priced');
  assert.equal(out.unpricedTokens, 3 * M);
  assert.deepEqual(out.unpricedModels, ['mystery']);
  assert.equal(out.tokens, 4 * M, 'and the token total covers both — volume is knowable either way');
  assert.deepEqual(out.top, { model: 'mystery', share: 0.75 });
});

test('no rate table at all is UNPRICED, which is a configuration gap and not a zero', () => {
  const rows = [{ tokensByModel: { opus: counters({ input: M }) } }];
  for (const rates of [null, undefined, {}]) {
    const out = priceWindow(rows, rates);
    assert.equal(out.usd, null, 'a page that showed $0 here would be stating a price nobody set');
    assert.equal(out.ratesSet, false, 'and this is what lets it name the key instead');
    assert.equal(out.unpricedTokens, M, 'the tokens are still counted');
  }
});

test('an empty window has no top model rather than a zero share of nothing', () => {
  const out = priceWindow([], { opus });
  assert.equal(out.top, null);
  assert.equal(out.usd, null);
  assert.equal(out.recorded, false);
});
