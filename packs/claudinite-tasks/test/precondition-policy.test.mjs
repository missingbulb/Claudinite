import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePreconditions, parsePreconditions, validatePreconditions,
  preconditionSignals, BUILTIN_TERM_NAMES, MAX_CONTEXT_ITEMS, termsMap,
} from '../precondition-policy.mjs';

// The precondition engine (task-preconditions DESIGN). Pure over the signals, so
// every case here is the real evaluator against a hand-built bundle.

const evaluate = (preconditions, signals = {}, over = {}) =>
  evaluatePreconditions({ preconditions, signals, windowDays: 1.05, ...over });

// --- the grammar --------------------------------------------------------------

test('the list is a CONJUNCTION and `||` binds inside one entry', () => {
  // `['X', 'Y || Z']` is `X && (Y || Z)`. The comma is deliberately the opposite
  // of an automerge list's, which is a union: one field grants, the other requires.
  const signals = (substantive, prs, issues) => ({
    commits: { substantiveChange: substantive },
    prs: { touched: prs ? [7] : [] },
    issues: { open: [{ number: 3, labels: [] }], touched: issues ? [3] : [] },
  });
  const run = (...args) => evaluate(['substantive-change', 'prs-touched || issues-touched'], signals(...args)).run;

  assert.equal(run(true, true, false), true);    // X && (Y)
  assert.equal(run(true, false, true), true);    // X && (Z)
  assert.equal(run(true, false, false), false);  // X && !(Y||Z)
  assert.equal(run(false, true, true), false);   // !X — no alternative rescues a failed conjunct
});

test('`none` is retired wherever it appears — the expression is the whole of when a task runs', () => {
  for (const illegal of [['none'], ['none', 'substantive-change'], ['substantive-change', 'none'], ['none || prs-touched']]) {
    assert.equal(parsePreconditions(illegal).kind, 'invalid', JSON.stringify(illegal));
    assert.match(evaluate(illegal, {}).error, /"none" is retired/);
  }
});

test('an inline argument is everything after the term\'s first colon', () => {
  const { conditions } = parsePreconditions(['no-open-pr-titled:Claudinite tidy: improve comments']);
  assert.deepEqual(conditions[0][0], {
    name: 'no-open-pr-titled',
    arg: 'Claudinite tidy: improve comments',
    text: 'no-open-pr-titled:Claudinite tidy: improve comments',
  });
});

test('the signal union is DERIVED from the conditions, built-in and task-local alike', () => {
  assert.deepEqual(preconditionSignals(['substantive-change', 'prs-touched'], new Map()), ['commits', 'prs']);
  assert.deepEqual(preconditionSignals(['none'], new Map()), []);
  const own = termsMap({ 'my-gate': { signals: ['release'], holds: () => ({ holds: true }) } });
  assert.deepEqual(preconditionSignals(['my-gate || substantive-change'], own), ['release', 'commits']);
});

// --- the fail direction: loud, never a quiet skip -----------------------------

test('an unreadable signal ERRORS rather than declining', () => {
  // The one deliberate inversion from the merge-policy engine. A decline here is
  // permanent silent staleness that nothing in the repo goes red over; an error is
  // a failed run in the queue's failure lane, where the re-queue lever retries it.
  const v = evaluate(['substantive-change'], { commits: { error: 'the commits API answered 502' } });
  assert.equal(v.run, undefined);
  assert.match(v.error, /substantive-change: the `commits` signal could not be read — .*502/);
});

test('an unknown term, a missing argument and a stray argument all error', () => {
  assert.match(evaluate(['no-such-thing'], {}).error, /unknown precondition "no-such-thing"/);
  assert.match(evaluate(['commits-under'], {}).error, /takes an inline argument and was given none/);
  assert.match(evaluate(['substantive-change:oops'], {}).error, /takes no argument/);
});

test('a term that throws errors — it is never read as "the condition did not hold"', () => {
  const own = termsMap({ boom: { signals: [], holds: () => { throw new Error('kaboom'); } } });
  assert.match(evaluate(['boom'], {}, { terms: own }).error, /the precondition "boom" threw: kaboom/);
});

test('an alternative that errors takes the whole verdict with it, even beside one that holds', () => {
  // Loud beats convenient: `A || B` where B could not be read is not "A, so fine" —
  // the next window may be the one where A is false and B was the real answer.
  const own = termsMap({ unreadable: { signals: [], holds: () => ({ error: 'no roster' }) } });
  const v = evaluate(['substantive-change || unreadable'], { commits: { substantiveChange: true } }, { terms: own });
  assert.match(v.error, /unreadable: no roster/);
});

// --- the built-in vocabulary --------------------------------------------------

test('every built-in term the remedy vocabulary names is one the evaluator resolves', () => {
  // The list a declaration's author is shown when they name something unknown must
  // be exactly the names that would not be unknown: a term listed but unresolvable
  // sends an author to a spelling that fails, one resolvable but unlisted is
  // invisible to them. An argument-taking term still resolves — its complaint is
  // about the argument, never about the name.
  for (const name of BUILTIN_TERM_NAMES) {
    const v = evaluate([name], {});
    assert.doesNotMatch(v.error ?? '', /unknown precondition/, name);
  }
  assert.match(evaluate(['no-such-thing'], {}).error, /unknown precondition/);
});

test('repo-active is the positive umbrella over all four activity dimensions', () => {
  const quiet = {
    commits: { substantiveChange: false }, issues: { open: [], touched: [] },
    prs: { touched: [] }, conversationLogs: { newestLogAgeDays: 30 },
  };
  assert.equal(evaluate(['repo-active'], quiet).run, false);
  for (const moved of [
    { commits: { substantiveChange: true } },
    { issues: { open: [{ number: 4, labels: [] }], touched: [4] } },
    { prs: { touched: [9] } },
    { conversationLogs: { newestLogAgeDays: 0.2 } },
  ]) {
    assert.equal(evaluate(['repo-active'], { ...quiet, ...moved }).run, true, JSON.stringify(moved));
  }
});

test('session-captured is measured against the run\'s own window, not a constant', () => {
  const logs = { conversationLogs: { newestLogAgeDays: 3 } };
  assert.equal(evaluate(['session-captured'], logs, { windowDays: 1.05 }).run, false);
  assert.equal(evaluate(['session-captured'], logs, { windowDays: 7.05 }).run, true);
  // A window the caller could not supply is not a reason to guess in either
  // direction — a weekly task would silently read as a daily one.
  assert.match(evaluate(['session-captured'], logs, { windowDays: null }).error, /lookback window is unknown/);
});

test('a queue work item is neither an issue touch nor a target', () => {
  // The scheduler's own items wear a `task:*` label for their whole life, and the
  // issues collector hides them only by title — so one filed under any other title
  // still reaches here.
  const withQueueItem = { issues: { open: [{ number: 9, labels: ['task:ready'] }], touched: [9] } };
  assert.equal(evaluate(['issues-touched'], withQueueItem).run, false);
  // A label that merely CONTAINS the marker is somebody else's label.
  const other = { issues: { open: [{ number: 4, labels: ['not-task:ready'] }], touched: [4] } };
  assert.equal(evaluate(['issues-touched'], other).run, true);
});

test('commits-under / commits-outside split the window\'s paths, and cap what they name', () => {
  const paths = { commits: { touchedPaths: ['.claudinite/local/packs/x/RULES.md', 'src/app.mjs'] } };
  assert.equal(evaluate(['commits-under:.claudinite/local'], paths).run, true);
  assert.equal(evaluate(['commits-under:docs/'], paths).run, false);

  const outside = evaluate(['commits-outside:.claudinite/'], paths);
  assert.equal(outside.run, true);
  const scope = outside.context.join(' ').split(': ')[1];
  assert.match(scope, /src\/app\.mjs/);
  assert.doesNotMatch(scope, /\.claudinite/, 'the excluded prefix names the boundary, never a path inside it');
  assert.equal(evaluate(['commits-outside:.claudinite/'], { commits: { touchedPaths: ['.claudinite/stamp.json'] } }).run, false);
});

test('a scope list says how many it dropped rather than reading as the whole window', () => {
  const many = Array.from({ length: MAX_CONTEXT_ITEMS + 5 }, (_, i) => `src/f${i}.mjs`);
  const v = evaluate(['commits-outside:.claudinite/'], { commits: { touchedPaths: many } });
  assert.equal(v.context.length, 2);
  assert.match(v.context[1], /^5 further path\(s\)/);
  assert.match(v.context[1], /NOT in scope this round/);
});

test('a pending round is never stacked on: unknown paths count as pending', () => {
  const open = (prs) => ({ prs: { open: prs } });
  assert.equal(evaluate(['no-open-pr-touching:product-wiki/'], open([])).run, true);
  assert.equal(evaluate(['no-open-pr-touching:product-wiki/'], open([{ number: 1, changedPaths: ['src/a.mjs'] }])).run, true);
  assert.equal(evaluate(['no-open-pr-touching:product-wiki/'], open([{ number: 2, changedPaths: ['product-wiki/M/README.md'] }])).run, false);
  // A file list that could not be read is UNKNOWN, and a skipped round is cheaper
  // than an unreviewed one stacked on it.
  const opaque = evaluate(['no-open-pr-touching:product-wiki/'], open([{ number: 3, changedPaths: null }]));
  assert.equal(opaque.run, false);
  assert.match(opaque.reason, /#3.*unknown/);

  assert.equal(evaluate(['no-open-pr-titled:My sweep'], open([{ number: 4, title: 'My sweep (round 3)' }])).run, false);
  assert.equal(evaluate(['no-open-pr-titled:My sweep'], open([{ number: 4, title: 'Something else' }])).run, true);
});

// --- the verdict's own shape --------------------------------------------------

test('the reason is composed from what held, or from the first condition that did not', () => {
  const signals = { commits: { substantiveChange: true, list: [{ sha: 'abcdef1234', substantive: true }] }, prs: { touched: [7] } };
  const granted = evaluate(['substantive-change', 'prs-touched'], signals);
  assert.match(granted.reason, /substantive default-branch commit/);
  assert.match(granted.reason, /1 open PR\(s\) moved/);
  assert.match(granted.context.join(' '), /abcdef1/);

  const declined = evaluate(['substantive-change', 'no-open-pr-titled:My sweep'], {
    ...signals, prs: { open: [{ number: 4, title: 'My sweep' }] },
  });
  assert.equal(declined.run, false);
  assert.match(declined.reason, /#4 is this pass's previous round/);
  assert.doesNotMatch(declined.reason, /substantive/, 'the conditions that held are not the reason it declined');
});

// --- static validation --------------------------------------------------------

test('a task-local term shadowing a built-in is loud, never a quiet override', () => {
  const clash = termsMap({ 'substantive-change': { signals: [], holds: () => ({ holds: true }) } });
  assert.match(validatePreconditions(['none'], clash).map((p) => p.what).join(' | '),
    /redefines the built-in term "substantive-change"/);
});
