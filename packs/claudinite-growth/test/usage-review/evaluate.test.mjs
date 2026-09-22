import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseComparison, holds, underFloor, evaluateRules, ruleSentence } from '../../tasks/usage-review/evaluate.mjs';

const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shipped = JSON.parse(readFileSync(join(packDir, 'usage-rules.json'), 'utf8')).rules;

// A reader over a plain map, which is what the worker's own reader reduces to.
const reader = (figures) => (name, { previous = false, median = false } = {}) => {
  const key = `${previous ? 'previous.' : ''}${median ? `median(${name})` : name}`;
  return key in figures ? figures[key] : null;
};

test('the grammar parses the four shapes and refuses anything outside them', () => {
  assert.deepEqual(parseComparison('a >= 3'), { left: [{ name: 'a', previous: false, median: false }], op: '>=', right: [{ value: 3 }] });
  assert.deepEqual(parseComparison('a = 0').op, '=');
  assert.equal(parseComparison('a / b <= 0.5').left.length, 2);
  // A window-against-window rule is one term — this window over the one before —
  // compared against a plain ratio.
  const windows = parseComparison('median(stopMs) / previous.median(stopMs) >= 1.25');
  assert.deepEqual(windows.left[0], { name: 'stopMs', previous: false, median: true });
  assert.deepEqual(windows.left[1], { name: 'stopMs', previous: true, median: true });
  assert.deepEqual(windows.right, [{ value: 1.25 }]);
  // The right side is a term too, so a rule may compare one ratio against another.
  assert.equal(parseComparison('skillCaught / skillSessions <= advisory / runs').right.length, 2);
  for (const not of ['a > 3', 'a and b >= 1', 'a >= 3 or b >= 2', '', 'a +']) {
    assert.throws(() => parseComparison(not), `${not} is outside the grammar`);
  }
});

test('a comparison holds, fails, or cannot be judged — and a missing figure is the third', () => {
  const c = parseComparison('skillBlocks / skillLoads >= 0.9');
  assert.equal(holds(c, reader({ skillBlocks: 9, skillLoads: 10 })), true);
  assert.equal(holds(c, reader({ skillBlocks: 8, skillLoads: 10 })), false);
  assert.equal(holds(c, reader({ skillBlocks: 9 })), null, 'a figure the record does not carry is not a zero');
  assert.equal(holds(c, reader({ skillBlocks: 9, skillLoads: 0 })), null, 'a ratio over nothing is a ratio nobody can state');
  // …and exactly on the threshold, which is the input `>=` and `>` disagree about.
  assert.equal(holds(c, reader({ skillBlocks: 9, skillLoads: 10 })), true);
  assert.equal(holds(parseComparison('relent >= 1'), reader({ relent: 1 })), true);
  assert.equal(holds(parseComparison('checkFindings = 0'), reader({ checkFindings: 0 })), true);
  assert.equal(holds(parseComparison('checkFindings = 0'), reader({ checkFindings: 1 })), false);
});

test('underFloor names the first figure that is short, and treats unrecorded as short', () => {
  assert.equal(underFloor({ sessions: 10 }, reader({ sessions: 12 })), null);
  assert.deepEqual(underFloor({ sessions: 10 }, reader({ sessions: 4 })), { name: 'sessions', need: 10, have: 4 });
  assert.deepEqual(underFloor({ sessions: 10 }, reader({})), { name: 'sessions', need: 10, have: null },
    'a window that does not carry the figure cannot be judged on it');
  // A floor may name the previous window, which is how a two-window rule refuses to
  // compare against a window that was not measured.
  assert.deepEqual(underFloor({ 'previous.runs': 20 }, reader({ 'previous.runs': 3 })), { name: 'previous.runs', need: 20, have: 3 });
  // …and exactly ON the floor is not under it.
  assert.equal(underFloor({ sessions: 10 }, reader({ sessions: 10 })), null);
});

test('a subject under its floor is recorded as not evaluated, never as clean', () => {
  const rules = [{
    id: 'r', over: 'skill', window: '28 days', floor: { sessions: 10 },
    when: 'skillSessions / sessions >= 0.75', cause: 'known', causes: ['x'], open: false,
    finding: 'f', recommendation: 'r',
  }];
  const figures = { quiet: { sessions: 4, skillSessions: 4 }, busy: { sessions: 20, skillSessions: 19 } };
  const { findings, notEvaluated } = evaluateRules(rules, {
    subjectsOf: () => [{ id: 'quiet' }, { id: 'busy' }],
    figureOf: (s, name, opts) => reader(figures[s.id])(name, opts),
    predicateOf: () => null,
  });
  assert.deepEqual(findings.map((f) => f.subject), ['busy']);
  assert.deepEqual(notEvaluated, [{ rule: 'r', subject: 'quiet', pack: null, name: 'sessions', need: 10, have: 4 }]);
});

test('a finding carries every figure its rule named, both windows where it asked for both', () => {
  const rules = [{
    id: 'checks-slower', over: 'checks', window: '28 days', floor: { runs: 20, 'previous.runs': 20 },
    when: 'median(stopMs) / previous.median(stopMs) >= 1.25', and: 'median(stopMs) >= 2000',
    cause: 'known', causes: ['one rule regressed'], open: false, finding: 'slower', recommendation: 'look',
  }];
  const figures = { runs: 40, 'previous.runs': 30, 'median(stopMs)': 3000, 'previous.median(stopMs)': 2000 };
  const { findings } = evaluateRules(rules, {
    subjectsOf: () => [{ id: 'checks', pack: 'basics' }],
    figureOf: (s, name, opts) => reader(figures)(name, opts),
    predicateOf: () => null,
  });
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].figures, figures);
  assert.equal(findings[0].pack, 'basics');
});

test('a live predicate is the other half of the pair, and one that cannot be read is not a finding', () => {
  const rule = {
    id: 'check-never-fires-with-prose-twin', over: 'check', window: '28 days', floor: { runs: 20 },
    when: 'checkFindings = 0', and: 'proseTwin',
    cause: 'probable', causes: ['the prose pre-empts it'], open: false, finding: 'f', recommendation: 'r',
  };
  const run = (twin) => evaluateRules([rule], {
    subjectsOf: () => [{ id: 'a-check' }],
    figureOf: (s, name, opts) => reader({ runs: 40, checkFindings: 0 })(name, opts),
    predicateOf: () => twin,
  });
  assert.equal(run(true).findings.length, 1);
  assert.equal(run(false).findings.length, 0, 'the record half alone is not the rule');
  assert.equal(run(null).findings.length, 0);
  assert.deepEqual(run(null).notEvaluated.map((n) => n.name), ['proseTwin'],
    'a pair whose live half could not be read is stated, not silently dropped');
});

test('a predicate can be required absent, which is how two rules split one signature', () => {
  // `check-never-fires` and `check-never-fires-with-prose-twin` read the same
  // record half. Without the negation the twin case satisfies BOTH, and one check
  // is reported twice in one review under two different causes.
  const rule = (and) => ({
    id: 'r', over: 'check', window: '28 days', floor: {},
    when: 'checkFindings = 0', and,
    cause: 'unknown', causes: ['x'], open: false, finding: 'f', recommendation: 'r',
  });
  const run = (and, twin) => evaluateRules([rule(and)], {
    subjectsOf: () => [{ id: 'a-check' }],
    figureOf: (s, name, opts) => reader({ checkFindings: 0 })(name, opts),
    predicateOf: () => twin,
  });
  assert.equal(run('proseTwin', true).findings.length, 1);
  assert.equal(run('!proseTwin', true).findings.length, 0, 'the twin case belongs to the other rule');
  assert.equal(run('!proseTwin', false).findings.length, 1);
  // Unknown still propagates through the negation rather than becoming `true`.
  assert.equal(run('!proseTwin', null).findings.length, 0);
  assert.deepEqual(run('!proseTwin', null).notEvaluated.map((n) => n.name), ['!proseTwin'],
    'the pair is reported as it was written, negation included');
  assert.match(ruleSentence(rule('!proseTwin')), /and not proseTwin/);
});

test('the two never-fires rules cannot both claim one check', () => {
  const shippedById = Object.fromEntries(shipped.map((r) => [r.id, r]));
  const plain = shippedById['check-never-fires'];
  const twin = shippedById['check-never-fires-with-prose-twin'];
  assert.equal(plain.when, twin.when, 'they read the same record half');
  assert.equal(twin.and, 'proseTwin');
  assert.equal(plain.and, '!proseTwin',
    'so the plain one must exclude what the twin one claims, or a check is reported twice');
});

test('every shipped rule parses, and its sentence names the subject it judges', () => {
  assert.ok(shipped.length >= 16, 'the shelf ships the whole declared set');
  for (const rule of shipped) {
    assert.doesNotThrow(() => parseComparison(rule.when), `${rule.id}: ${rule.when}`);
    if (rule.and && /(>=|<=|=)/.test(rule.and)) assert.doesNotThrow(() => parseComparison(rule.and), rule.id);
    for (const name of Object.keys(rule.floor)) assert.doesNotThrow(() => underFloor({ [name]: 0 }, () => 1), rule.id);
    assert.match(ruleSentence(rule), new RegExp(`over every ${rule.over}`));
    assert.equal(rule.causes.length >= 1, true, `${rule.id} names at least one cause`);
    // A closed list claims the mechanism settles it, so it must not also be the
    // shape that invites a reader to add one.
    if (rule.cause === 'known') assert.equal(rule.open, false, `${rule.id}: a known cause closes its list`);
  }
});

test('every figure the shipped rules read is one the worker knows how to answer', async () => {
  const { FIGURES } = await import('../../tasks/usage-review/figures.mjs');
  const named = new Set();
  for (const rule of shipped) {
    const terms = [parseComparison(rule.when)];
    if (rule.and && /(>=|<=|=)/.test(rule.and)) terms.push(parseComparison(rule.and));
    for (const t of terms) for (const atom of [...t.left, ...t.right]) if (atom.name) named.add(atom.name);
    for (const name of Object.keys(rule.floor)) named.add(name.replace(/^previous\./, ''));
  }
  assert.ok(named.size >= 12, 'the rules read a real spread of the record');
  const unanswerable = [...named].filter((n) => !FIGURES.has(n));
  assert.deepEqual(unanswerable, [], 'a rule reading a figure nothing computes never fires, silently');
});
