// Run with `node --test packs-tests/claudinite-dashboard/tasks/fleet-digest/*.test.mjs`.
//
// worker.mjs's decidable parts — which days a run covers, what "now" each is collected
// as-of, and how those days get sorted into written / quiet / needs-judgment. The
// as-of is the subtle one: get it wrong and every backfilled day carries today's
// neglect rather than its own.
//
// What is NOT here: the delivery plumbing (pushGenerated, deliverGenerated, the agent
// request). That is a git remote away and is the engine's own tested code; the logic
// worth pinning is the part this task decides for itself, which planBriefs exists to
// make reachable without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackfillDays, backfillDates, asOf, planBriefs, plain, renderNudge } from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/worker.mjs';

const NOW = '2026-08-09T05:00:00Z';

test('the override is read out of the bag the scheduler already carries', () => {
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=7'), 7);
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=1'), 1);
  assert.equal(parseBackfillDays('Created by hand.\nDIGEST_BACKFILL_DAYS=7'), 7, 'newline-separated, beside the item\'s prose');
});

test('absent or unusable means no backfill — never a partial guess', () => {
  // "backfill 7 days" and "backfill 0 days" are a whole run's work apart.
  assert.equal(parseBackfillDays(undefined), null);
  assert.equal(parseBackfillDays(''), null);
  assert.equal(parseBackfillDays('Created by hand — no precondition asserts there is work to do.'), null);
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=0'), null);
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=-3'), null);
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=lots'), null);
});

test('a runaway request is bounded, not honoured', () => {
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=365'), 30);
  assert.equal(parseBackfillDays('DIGEST_BACKFILL_DAYS=7.9'), 7, 'floored');
});

test('backfill covers the N most recent COMPLETE days, oldest first', () => {
  assert.deepEqual(backfillDates(NOW, 7), [
    '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
    '2026-08-06', '2026-08-07', '2026-08-08',
  ]);
  assert.equal(backfillDates(NOW, 7).length, 7);
});

test('today is never in range — it is not over yet', () => {
  assert.ok(!backfillDates(NOW, 30).includes('2026-08-09'));
  assert.equal(backfillDates(NOW, 1)[0], '2026-08-08', 'one day back is the day the daily run would cover');
});

test('the range crosses month and year boundaries', () => {
  assert.deepEqual(backfillDates('2026-03-02T05:00:00Z', 3), ['2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(backfillDates('2026-01-02T05:00:00Z', 3), ['2025-12-30', '2025-12-31', '2026-01-01']);
});

test('a brief is written as-of the morning after its own day', () => {
  // This is what makes a backfilled brief the brief that day WOULD have got: the
  // nudge measures its quiet window back from here, so a Tuesday five days ago is
  // judged on what was quiet then, not on what is quiet now.
  assert.equal(asOf('2026-08-08').toISOString(), '2026-08-09T00:00:00.000Z');
  assert.equal(asOf('2026-02-28').toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(asOf('2025-12-31').toISOString(), '2026-01-01T00:00:00.000Z');
});

test('as-of makes a brief a pure function of its date', () => {
  // Re-running any day reproduces it — the same property the nudge's date-seeded pick
  // is after, and the reason a backfill and the daily run agree on a shared day.
  assert.equal(asOf('2026-08-08').getTime(), asOf('2026-08-08').getTime());
  assert.ok(asOf('2026-08-08') < asOf('2026-08-09'));
});

// --- the three-way split ----------------------------------------------------
//
// Fixture dates are 1999, deliberately. An earlier version used dates from the window
// the fleet was actually running in, so the digest paths these assertions build
// collided with briefs the repo really had — and reference-integrity flagged the test
// the moment those briefs were regenerated. A fixture that shares a namespace with a
// real dated artifact is a fixture that has started depending on repo state.

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const DECL = b64(JSON.stringify({ packs: ['basics'] }));

// A fake fleet of one repo. `byDay` says which dates had a real merged PR; every other
// day is quiet. The PR-detail route gives every PR a size so it ranks.
function fakeFleet(byDay) {
  const prs = byDay.map((date, i) => ({
    number: i + 1,
    title: `Work on ${date}`,
    html_url: `https://example/pr/${i + 1}`,
    merged_at: `${date}T12:00:00Z`,
    updated_at: `${date}T12:00:00Z`,
    head: { ref: 'feature/x' },
    user: { login: 'ariel', type: 'User' },
  }));
  return async (path) => {
    if (path.startsWith('/user/repos')) {
      return { status: 200, json: [{ full_name: 'acme/one', owner: { login: 'acme' }, archived: false, fork: false }] };
    }
    if (path.includes('/contents/')) return { status: 200, json: { content: DECL } };
    if (/\/pulls\/\d+$/.test(path)) return { status: 200, json: { additions: 200, deletions: 10, changed_files: 4, body: 'real work' } };
    if (path.includes('/pulls?')) return { status: 200, json: prs };
    if (path.includes('/issues?')) return { status: 200, json: [] };
    return { status: 404, json: null };
  };
}

const plan = (dates, { busy = [], written = [] } = {}) => planBriefs({
  gh: fakeFleet(busy),
  dates,
  exists: (d) => written.includes(d),
  owner: 'acme',
  exclude: new Set(),
  digest: { pick: 4, shortlist: 6, nudge: { enabled: true, quietDays: 7 } },
});

test('a backfill splits its days three ways', async () => {
  const dates = ['1999-03-02', '1999-03-03', '1999-03-04'];
  const r = await plan(dates, { busy: ['1999-03-03'], written: ['1999-03-02'] });

  assert.deepEqual(r.skipped, ['1999-03-02'], 'already written, never recollected');
  assert.deepEqual(r.needJudgment.map((d) => d.date), ['1999-03-03'], 'the busy day goes to the agent');
  assert.deepEqual(Object.keys(r.quietFiles), ['digests/1999-03-04.md'], 'the empty day is written here');
  assert.equal(r.summaries.length, 2, 'a summary per day actually collected');
});

test('every day already written means nothing to do at all', async () => {
  const dates = ['1999-03-02', '1999-03-03'];
  const r = await plan(dates, { busy: dates, written: dates });
  assert.deepEqual(r.skipped, dates);
  assert.deepEqual(r.needJudgment, []);
  assert.deepEqual(r.quietFiles, {});
});

test('each day is judged on its own candidates, not the run\'s', async () => {
  // The failure this guards: collecting once and reusing the result across days, which
  // would give every backfilled brief the same accomplishments.
  const r = await plan(['1999-03-02', '1999-03-03'], { busy: ['1999-03-02', '1999-03-03'] });
  assert.equal(r.needJudgment.length, 2);
  assert.deepEqual(r.needJudgment[0].shortlist.map((i) => i.title), ['Work on 1999-03-02']);
  assert.deepEqual(r.needJudgment[1].shortlist.map((i) => i.title), ['Work on 1999-03-03']);
});

test('a quiet day is written as a finished brief, not a stub', async () => {
  const r = await plan(['1999-03-04']);
  const brief = r.quietFiles['digests/1999-03-04.md'];
  assert.match(brief, /^Fleet operations — 1999-03-04$/m);
  assert.match(brief, /No pull requests merged and no issues closed/);
  assert.match(brief, /No agent ran/);
});

test('a quiet day is plain text, like every other brief', async () => {
  // It is sent verbatim through a renderer that shows markdown raw, and code-work writes
  // this one itself — so the constraint the agent works under binds the code equally.
  const r = await plan(['1999-03-04']);
  const brief = r.quietFiles['digests/1999-03-04.md'];
  assert.doesNotMatch(brief, /^#|[*`]|\[[^\]]*\]\([^)]*\)/m, 'no heading, emphasis, backtick or link syntax');
});

test('a title that quotes an identifier is flattened, never reproduced raw', () => {
  // Real titles from this fleet carry backticks constantly, and the nudge reproduces a
  // title as a fact — so the flattening has to happen where the fact is rendered.
  assert.equal(plain('Convert the `Comment class:` menu-restating rule to a check'),
    'Convert the "Comment class:" menu-restating rule to a check');
  assert.equal(plain('**Rebuild** the promotion PR'), 'Rebuild the promotion PR');
  assert.equal(plain('DIGEST_BACKFILL_DAYS keeps its underscores'), 'DIGEST_BACKFILL_DAYS keeps its underscores');
});

test('the nudge names the repo, the last change and a bare URL', () => {
  const lines = renderNudge({
    repo: 'missingbulb/TLDR',
    last: { at: '1999-02-11T09:00:00Z', number: 162, url: 'https://example/pr/162', title: 'Convert the `Comment class:` rule' },
  });
  assert.equal(lines[0], 'Worth returning to:');
  assert.equal(lines[2], '• missingbulb/TLDR — last meaningful change 1999-02-11: #162 Convert the "Comment class:" rule https://example/pr/162');
});

test('an ordinary single-day run is just a backfill of one', async () => {
  const r = await plan(['1999-03-08'], { busy: ['1999-03-08'] });
  assert.equal(r.needJudgment.length, 1);
  assert.equal(r.needJudgment[0].date, '1999-03-08');
});
