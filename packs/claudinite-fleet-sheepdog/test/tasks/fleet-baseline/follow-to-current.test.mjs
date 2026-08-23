// THE FOLLOW's whole promise: the sweep's verdict is what the MEMBERS say, not what
// its own dispatch POSTs returned (#1293). These pin the outcomes rather than the
// polling — the clock and the sleep are injected, so nothing here waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  followToCurrent, startedSince, pollDelay, isSuccess, POLL_MS,
  ALREADY_CURRENT, CONVERGED, NEVER_STARTED, DID_NOT_CONVERGE, UNKNOWN,
} from '../../../tasks/fleet-baseline/follow-to-current.mjs';

// A fake canon. Versions are date-anchored `<day>.<n>` like every real one — a shape
// the corpus's own isVersion accepts, so this exercises the real comparison.
const NEW = '60823.2';
const OLD = '60823.1';
const canon = { engine: async () => NEW, pack: async () => NEW };

// A member declaration stamping the given version for the engine and its one declared
// pack — so `at(NEW)` is current against the canon above and `at(OLD)` is behind.
const at = (v) => ({ engineVersion: v, packs: [{ id: 'basics', version: v }] });

// `gh` over a per-repo script: `versions` is the sequence of declarations successive
// reads return (the last repeats), `runs` whether a dispatch run is visible.
const fakeGh = (repos) => {
  const reads = new Map();
  return async (path) => {
    const m = /^\/repos\/([^/]+\/[^/]+)\//.exec(path);
    const name = m?.[1];
    const spec = repos[name];
    if (!spec) return { status: 404, json: null };
    if (path.includes('/actions/workflows/') && path.includes('/runs')) {
      return { status: spec.runsStatus ?? 200, json: { workflow_runs: spec.started
        ? [{ created_at: '2500-01-01T00:00:00Z' }] : [] } };
    }
    // The mount probe's own scheduler-presence read. Answered, but it must NOT consume
    // a step of the version sequence below — that sequence is the member's settings
    // file changing under the follow, and nothing else.
    if (path.includes('/contents/claudinite-scheduler.yml')) return { status: 200, json: {} };
    if (path.includes('/contents/')) {
      if (spec.readStatus && spec.readStatus !== 200) return { status: spec.readStatus, json: null };
      const n = reads.get(name) ?? 0;
      reads.set(name, n + 1);
      const seq = spec.versions;
      return { status: 200, json: { content: Buffer.from(JSON.stringify(seq[Math.min(n, seq.length - 1)])).toString('base64') } };
    }
    return { status: 200, json: {} };
  };
};

// The sweep's own declaration reader, faked to the same script.
const readerFor = (gh) => async (_gh, fullName) => {
  const res = await gh(`/repos/${fullName}/contents/.claudinite-settings.json`);
  if (res.status !== 200) return null;
  return JSON.parse(Buffer.from(res.json.content, 'base64').toString('utf8'));
};

const follow = (repos, members, { budgetMs = 600_000 } = {}) => {
  const gh = fakeGh(repos);
  const slept = [];
  let clock = 0;
  return followToCurrent(gh, members, {
    canon,
    readDeclaration: readerFor(gh),
    budgetMs,
    now: () => clock,
    sleep: async (ms) => { slept.push(ms); clock += ms; },
  }).then((out) => ({ out, slept }));
};

const member = (fullName, wasFresh = false) =>
  ({ fullName, firedAt: '2000-01-01T00:00:00Z', wasFresh });

test('a member already at canon versions is a success, and a DISTINCT one', async () => {
  const { out, slept } = await follow(
    { 'o/a': { versions: [at(NEW)] } },
    [member('o/a', true)]);
  assert.equal(out[0].outcome, ALREADY_CURRENT);
  assert.ok(isSuccess(out[0].outcome));
  // Its update declines and it does no work — demanding work of it would report a
  // fault where there is none.
  assert.deepEqual(slept, [], 'an already-current fleet finishes on the first pass');
});

test('a member that was behind and reaches canon reports converged, not already-current', async () => {
  const { out } = await follow(
    { 'o/a': { versions: [at(OLD), at(OLD), at(NEW)] } },
    [member('o/a', false)]);
  assert.equal(out[0].outcome, CONVERGED);
  assert.ok(isSuccess(out[0].outcome));
});

// The exact shape #1292 caught: the dispatch was accepted and the member took nothing.
test('a dispatched member that never reaches canon is a FAILURE, not a fired count', async () => {
  const { out } = await follow(
    { 'o/a': { versions: [at(OLD)], started: true } },
    [member('o/a')], { budgetMs: 30_000 });
  assert.equal(out[0].outcome, DID_NOT_CONVERGE);
  assert.equal(isSuccess(out[0].outcome), false);
  assert.match(out[0].detail, /scheduler ran/);
  assert.match(out[0].detail, /behind canon by engine v60823\.1 → v60823\.2/);
});

// A dispatch that vanished is a different fix from a converge that fell short, so the
// two must not share an outcome.
test('a member whose run never started is told apart from one that ran and fell short', async () => {
  const { out } = await follow(
    { 'o/a': { versions: [at(OLD)], started: false } },
    [member('o/a')], { budgetMs: 30_000 });
  assert.equal(out[0].outcome, NEVER_STARTED);
  assert.match(out[0].detail, /queued and never ran/);
});

test('each member leaves the loop as it reads current — a slow one does not hold the rest', async () => {
  const { out } = await follow({
    'o/fast': { versions: [at(NEW)] },
    'o/slow': { versions: [at(OLD), at(OLD), at(OLD), at(NEW)] },
  }, [member('o/fast', true), member('o/slow')]);
  assert.deepEqual(out.map((f) => f.outcome), [ALREADY_CURRENT, CONVERGED]);
});

test('the report keeps the sweep\'s member order, whatever order they finish in', async () => {
  const { out } = await follow({
    'o/a': { versions: [at(OLD), at(OLD), at(NEW)] },
    'o/b': { versions: [at(NEW)] },
    'o/c': { versions: [at(OLD), at(NEW)] },
  }, [member('o/a'), member('o/b', true), member('o/c')]);
  assert.deepEqual(out.map((f) => f.fullName), ['o/a', 'o/b', 'o/c']);
});

// A transient read failure must not condemn a member that is converging fine.
test('a read that fails once and then succeeds still converges', async () => {
  const gh = fakeGh({ 'o/a': { versions: [at(NEW)] } });
  let calls = 0;
  const flaky = async (_gh, fullName) => {
    calls += 1;
    if (calls === 1) throw new Error('502 from the API');
    return readerFor(gh)(_gh, fullName);
  };
  let clock = 0;
  const out = await followToCurrent(gh, [member('o/a', true)], {
    canon, readDeclaration: flaky, budgetMs: 600_000,
    now: () => clock, sleep: async (ms) => { clock += ms; },
  });
  assert.equal(out[0].outcome, ALREADY_CURRENT);
});

test('a member that can never be read is UNKNOWN, never a silent success', async () => {
  const gh = fakeGh({ 'o/a': { versions: [at(NEW)] } });
  let clock = 0;
  const out = await followToCurrent(gh, [member('o/a')], {
    canon,
    readDeclaration: async () => { throw new Error('403 no access'); },
    budgetMs: 30_000,
    now: () => clock, sleep: async (ms) => { clock += ms; },
  });
  assert.equal(out[0].outcome, UNKNOWN);
  assert.equal(isSuccess(out[0].outcome), false);
  assert.match(out[0].detail, /403 no access/);
});

test('the poll backs off and never exceeds its longest step', () => {
  assert.equal(pollDelay(0), POLL_MS[0]);
  assert.ok(pollDelay(1) > pollDelay(0), 'it backs off');
  assert.equal(pollDelay(99), POLL_MS.at(-1), 'and is capped, so it keeps checking usefully');
});

test('the last sleep never overruns the budget', async () => {
  const { slept } = await follow(
    { 'o/a': { versions: [at(OLD)], started: true } },
    [member('o/a')], { budgetMs: 20_000 });
  assert.ok(slept.reduce((a, b) => a + b, 0) <= 20_000,
    'the follow stops at its budget rather than sleeping past it');
});

// A listing that does not answer is not evidence of absence.
test('startedSince throws on a listing that fails rather than reporting "never started"', async () => {
  const gh = fakeGh({ 'o/a': { versions: [at(NEW)], runsStatus: 500 } });
  await assert.rejects(() => startedSince(gh, 'o/a', '2000-01-01T00:00:00Z'), /500/);
});

test('startedSince only counts runs at or after the dispatch instant', async () => {
  const gh = async () => ({ status: 200, json: { workflow_runs: [{ created_at: '2020-01-01T00:00:00Z' }] } });
  assert.equal(await startedSince(gh, 'o/a', '2021-01-01T00:00:00Z'), false);
  assert.equal(await startedSince(gh, 'o/a', '2019-01-01T00:00:00Z'), true);
});

// --- what the run CLAIMS -------------------------------------------------------
// The report and the escalation are pure over what the sweep observed, so what the
// lever tells the owner is testable without a fleet. This is where #1292's regression
// would reappear, so it is asserted directly rather than left to the follow's unit
// tests.
import { renderBaselineReport, runVerdict, OUTCOME_SECTIONS } from '../../../tasks/fleet-baseline/force-fleet-baseline.mjs';

const outcome = (fullName, o, detail = 'because') => ({ fullName, outcome: o, detail });

const report = (over = {}) => renderBaselineReport({
  owner: 'acme', dryRun: false, filter: null,
  fired: [], followed: [], skipped: [], failed: [], ...over,
});

test('the headline is current-of-dispatched, never a count of dispatches', () => {
  const followed = [
    outcome('acme/a', CONVERGED), outcome('acme/b', ALREADY_CURRENT),
    outcome('acme/c', DID_NOT_CONVERGE), outcome('acme/d', NEVER_STARTED),
  ];
  const out = report({ fired: followed, followed });
  assert.match(out, /\| current \| not current \|/);
  assert.match(out, /\| 2 of 4 \| 2 \|/, 'the big number is what the members say');
  assert.doesNotMatch(out, /\| fired \|/, 'the old dispatch-count table is gone');
});

// The exact run that prompted this: every dispatch accepted, most members untouched.
test('a sweep where every dispatch landed and nothing converged does NOT read as success', () => {
  const followed = Array.from({ length: 9 }, (_, i) => outcome(`acme/r${i}`, DID_NOT_CONVERGE));
  const out = report({ fired: followed, followed });
  assert.match(out, /\| 0 of 9 \| 9 \|/);
  assert.match(runVerdict({ fired: followed, followed, failed: [] }),
    /9 of 9 dispatched member\(s\) did not reach canon's versions/);
});

test('a fully current fleet fails nothing', () => {
  const followed = [outcome('acme/a', CONVERGED), outcome('acme/b', ALREADY_CURRENT)];
  assert.equal(runVerdict({ fired: followed, followed, failed: [] }), null);
});

// An undispatchable member is a grant to fix and must not be masked by the follow's
// own verdict, so it is reported first.
test('a failed dispatch outranks a follow failure in the escalation', () => {
  const followed = [outcome('acme/a', DID_NOT_CONVERGE)];
  assert.match(runVerdict({
    fired: followed, followed,
    failed: [{ fullName: 'acme/z', state: 'no-permission', detail: '403' }],
  }), /could not be dispatched/);
});

test('every outcome the follow can produce has a section to be reported in', () => {
  const named = new Set(OUTCOME_SECTIONS.map(([state]) => state));
  for (const state of [ALREADY_CURRENT, CONVERGED, NEVER_STARTED, DID_NOT_CONVERGE, UNKNOWN]) {
    assert.ok(named.has(state), `${state} would be observed and never printed`);
  }
});

// "Current" is a claim about published version numbers and nothing more — the report
// has to say so itself, since that is exactly the gap #1292 found.
test('the report states what current does NOT cover', () => {
  const followed = [outcome('acme/a', ALREADY_CURRENT)];
  assert.match(report({ fired: followed, followed }), /without a version bump moves no number/);
});

test('a dry run reports what it would fire and claims no outcome', () => {
  const out = report({ dryRun: true, fired: [{ fullName: 'acme/a' }] });
  assert.match(out, /DRY RUN/);
  assert.match(out, /Would fire/);
  assert.doesNotMatch(out, /\| current \|/, 'it dispatched nothing, so it reports no outcome');
});
