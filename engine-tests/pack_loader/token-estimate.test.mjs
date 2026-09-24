import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHARS_PER_TOKEN, countChars, countWords, estimateTokens, estimateTokensOf,
} from '../../engine/pack_loader/token-estimate.mjs';

test('the estimate is characters over the ratio, and text is counted by its characters', () => {
  // Stated as the ratio's own arithmetic rather than as a figure read off a run, so
  // the assertion moves with the constant instead of restating it.
  const text = 'x'.repeat(4200);
  assert.equal(countChars(text), 4200);
  assert.equal(estimateTokensOf(text), Math.round(4200 / CHARS_PER_TOKEN));
});

test('nothing is collapsed away before counting', () => {
  // The reason the estimate left words behind: a backticked path is one
  // whitespace-delimited word and a dozen real tokens, so a counter that splits on
  // whitespace reads dense Markdown as a fraction of its weight.
  const dense = '`packs/basics/worldRules/claude-md-length.mjs`'; // @real-entity the corpus this ratio describes is this repo's own
  const asWords = dense.trim().split(/\s+/).length;
  assert.equal(asWords, 1);
  assert.ok(estimateTokensOf(dense) > asWords * 5, 'one word, and the better part of a line of tokens');
});

test('rounding coarsens the answer without changing what it counts', () => {
  // Written off the ratio rather than off figures, so only the calibration below
  // pins the constant and a deliberate re-measure is a one-line change.
  const hundredAndTwo = CHARS_PER_TOKEN * 102;
  assert.equal(estimateTokens(hundredAndTwo), 102, 'to the token, where a short body would round to nothing');
  assert.equal(estimateTokens(hundredAndTwo, 100), 100, 'to the hundred, for a sense of scale');
});

test('nothing at all is zero, never a throw', () => {
  for (const nothing of [null, undefined, '']) {
    assert.equal(countChars(nothing), 0);
    assert.equal(estimateTokensOf(nothing), 0);
  }
});

test('the deprecated countWords alias answers characters, so a packs/ copy one lane behind computes the same figure', () => {
  // A member can hold this engine beside a `packs/` copy whose only use of the old
  // name is `estimateTokens(countWords(text))`. The alias keeps that composition
  // answering what the current caller answers; anything else hands that member a
  // silently different number from the one this repo reports.
  const text = 'some prose, `an-id`, and a path/to/a/file.mjs\n'.repeat(120);
  assert.equal(estimateTokens(countWords(text)), estimateTokensOf(text));
});

// THE CALIBRATION. The ratio is a claim about a real tokenizer's behaviour over this
// repo's own text, and nothing in the estimator can check itself against that. So the
// claim is carried as a committed artifact: excerpts of real pack prose and real skill
// bodies, each with the token count `cl100k_base` gave it, recorded when the ratio was
// chosen. A tokenizer is not a dependency this repo carries, which is what makes the
// recorded counts the test rather than a live run.
//
// Two tolerances, because they answer different questions. Per sample is loose: one
// file's density is not the corpus's, and the spread across these four is 3.75 to 4.36
// characters per token. In aggregate it is tight, because the aggregate is what both
// readers of this estimator actually report — a whole corpus, not one file.
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'token-calibration.json');
const calibration = JSON.parse(readFileSync(fixtures, 'utf8'));
const off = (estimated, real) => Math.abs(estimated - real) / real;

test('the ratio lands close to what a real tokenizer counted for this corpus', () => {
  assert.ok(calibration.samples.length >= 4, 'both kinds of text the estimator is asked about, twice over');
  let chars = 0;
  let tokens = 0;
  for (const sample of calibration.samples) {
    assert.equal(sample.text.length, sample.chars, `${sample.from} was edited without re-measuring`);
    assert.ok(off(estimateTokensOf(sample.text), sample.tokens) <= 0.15,
      `${sample.from}: estimated ${estimateTokensOf(sample.text)} against ${sample.tokens} real`);
    chars += sample.chars;
    tokens += sample.tokens;
  }
  assert.ok(off(estimateTokens(chars), tokens) <= 0.05,
    `over the whole sample: estimated ${estimateTokens(chars)} against ${tokens} real, `
    + `which is ${(chars / tokens).toFixed(2)} characters per token against the ${CHARS_PER_TOKEN} assumed. `
    + 'Re-measure with a tokenizer before moving the constant.');
});
