import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoster, coverageView, freshnessView,
} from '../../../tasks/fleet-roster/check-fleet-roster.mjs';
import { canonVersions } from '../../../tasks/fleet-roster/drift-issues.mjs';

// The merged walk (#788). What is worth locking down is not that the two questions
// still get answered — their own modules' tests cover that — but that the walk reads
// each repo ONCE and that the two views can still disagree about what it found. The
// disagreements below are the ones the two separate sweeps used to reach by accident;
// here they are deliberate, and a test says so.

const HOME = 'o/enforcer';
const CANON = 'o/Claudinite';

const CANON_SOURCE = {
  'engine/version.mjs': 'export const ENGINE_VERSION = 4;\n',
  'packs/basics/pack.mjs': "export default {\n  id: 'basics',\n  version: 7,\n};\n",
};

const repo = (name, over = {}) => ({ name, full_name: `o/${name}`, archived: false, fork: false, ...over });

// A fake API over declarations, scheduler-workflow presence, canon compares and
// canon's own version numbers. Records every path so "read once" is an assertion
// rather than a claim.
function fakeGh({ declarations = {}, schedulers = [], compares = {}, errors = {} } = {}) {
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    if (errors[path]) return { status: errors[path], json: null };

    let m = /^\/repos\/(.+)\/contents\/\.claudinite-checks\.json$/.exec(path);
    if (m) {
      const decl = declarations[m[1]];
      if (decl === undefined) return { status: 404, json: null };
      const content = typeof decl === 'string' ? decl : JSON.stringify(decl);
      return { status: 200, json: { content: Buffer.from(content).toString('base64'), sha: 'sha' } };
    }
    m = /^\/repos\/(.+)\/contents\/\.github\/workflows\/claudinite-scheduler\.yml$/.exec(path);
    if (m) return { status: schedulers.includes(m[1]) ? 200 : 404, json: { content: '' } };

    m = /^\/repos\/.+\/compare\/(.+)\.\.\..+\?per_page=1$/.exec(path);
    if (m) {
      const c = compares[m[1]];
      if (!c) return { status: 404, json: null };
      return { status: 200, json: { status: c.status } };
    }

    // Canon's own numbers — the source every member is measured against.
    const text = CANON_SOURCE[path.replace(`/repos/${CANON}/contents/`, '')];
    if (path.startsWith(`/repos/${CANON}/contents/`)) {
      if (text === undefined) return { status: 404, json: null };
      return { status: 200, json: { content: Buffer.from(text).toString('base64') } };
    }
    throw new Error(`unexpected path ${path}`);
  };
  return { gh, seen };
}

const walk = (gh, repos, over = {}) => buildRoster(gh, repos, {
  home: HOME, canonRepo: CANON, canonBranch: 'main', exclude: new Set(), canonVersions: canonVersions(gh, CANON), ...over,
});

// `current` stamps exactly what CANON_SOURCE says; anything lower is a gap.
const declOf = (ref, over = {}, stamp = {}) => ({
  packs: [{ id: 'basics' }],
  claudinite: { ref, engineVersion: 4, packVersions: { basics: 7 }, ...stamp },
  ...over,
});

// --- the walk reads each repo once --------------------------------------------

test('buildRoster: the declaration is read once per repo, and both questions use that one read', async () => {
  const { gh, seen } = fakeGh({
    declarations: { 'o/alpha': declOf('abc') },
    schedulers: ['o/alpha'],
    compares: { abc: { status: 'identical' } },
  });
  await walk(gh, [repo('alpha')]);
  const declReads = seen.filter((p) => p.endsWith('.claudinite-checks.json'));
  assert.equal(declReads.length, 1, 'the two questions shared one declaration read — this is the merge');
  assert.equal(seen.length, 5, 'declaration + scheduler workflow + canon compare + canon engine + canon basics');
});

test('buildRoster: the enforcer, archived repos and forks are never read at all', async () => {
  const { gh, seen } = fakeGh({});
  const roster = await walk(gh, [
    repo('enforcer'), repo('attic', { archived: true }), repo('copy', { fork: true }),
  ]);
  assert.deepEqual(seen, [], 'nothing below the structural skips is reachable, so nothing is fetched');
  assert.deepEqual(roster.map((e) => e.fullName), ['o/attic', 'o/copy', 'o/enforcer']);
  assert.equal(roster.find((e) => e.fullName === 'o/enforcer').isHome, true);
});

test('buildRoster: canon, excluded, dormant and uncovered repos are read but never probed', async () => {
  // Each is covered-or-not by the coverage question and out of the freshness one, so
  // the two extra reads would be spent on an answer nothing consumes.
  const { gh, seen } = fakeGh({
    declarations: {
      'o/Claudinite': declOf('abc'),
      'o/left-out': declOf('abc'),
      'o/asleep': declOf('abc', { dormant: true }),
    },
  });
  await walk(gh, [repo('Claudinite'), repo('left-out'), repo('asleep'), repo('naked')], {
    exclude: new Set(['o/left-out']),
  });
  assert.deepEqual(seen.filter((p) => !p.endsWith('.claudinite-checks.json')), [],
    'no scheduler read and no compare for any repo the freshness question does not measure');
  assert.equal(seen.length, 4);
});

// --- the two views disagree, on purpose ---------------------------------------

test('an excluded repo that still carries a declaration is covered, and out of scope for freshness', async () => {
  // The divergence the two separate sweeps reached by accident (#788): the census
  // tested `exclude` only after finding a repo uncovered, the freshness sweep tested
  // it before reading anything. Both readings survive — from one roster entry.
  const { gh } = fakeGh({ declarations: { 'o/left-out': declOf('abc') } });
  const roster = await walk(gh, [repo('left-out')], { exclude: new Set(['o/left-out']) });

  assert.deepEqual(coverageView(roster).covered, ['o/left-out']);
  assert.deepEqual(coverageView(roster).optedOut, []);
  const f = freshnessView(roster);
  assert.deepEqual(f.outOfScope, ['o/left-out (excluded)']);
  assert.deepEqual(f.gone, ['o/left-out']);
});

test('an excluded repo with no declaration is opted out, not merely uncovered', async () => {
  const { gh } = fakeGh({});
  const roster = await walk(gh, [repo('left-out')], { exclude: new Set(['o/left-out']) });
  assert.deepEqual(coverageView(roster).optedOut, ['o/left-out']);
  assert.deepEqual(coverageView(roster).uncovered, []);
});

test('canon is an ordinary covered member to coverage, and never measured by freshness', async () => {
  const { gh } = fakeGh({ declarations: { 'o/Claudinite': declOf('abc') } });
  const roster = await walk(gh, [repo('Claudinite')]);
  assert.deepEqual(coverageView(roster).covered, ['o/claudinite']);
  const f = freshnessView(roster);
  assert.deepEqual([...f.fresh, ...f.unhealthy, ...f.outOfScope, ...f.dormant], [],
    'canon has no vendored mount to be stale — it is named in the summary, not bucketed');
});

test('a dormant member is covered, counted dormant by both, and never probed', async () => {
  const { gh, seen } = fakeGh({ declarations: { 'o/asleep': declOf('ancient', { dormant: true }) } });
  const roster = await walk(gh, [repo('asleep')]);
  assert.deepEqual(coverageView(roster).dormant, ['o/asleep']);
  assert.deepEqual(coverageView(roster).covered, []);
  assert.deepEqual(freshnessView(roster).dormant, ['o/asleep']);
  assert.equal(seen.length, 1, 'the deliberately stale stamp is not even looked up against canon');
});

test('an uncovered repo is the coverage question\'s subject and out of scope for freshness', async () => {
  const { gh } = fakeGh({});
  const roster = await walk(gh, [repo('naked')]);
  assert.deepEqual(coverageView(roster).uncovered, ['o/naked']);
  assert.match(freshnessView(roster).outOfScope[0], /^o\/naked \(uncovered/);
});

// --- unknown is per-question --------------------------------------------------

test('an unreadable declaration is unknown to BOTH questions — it is the input they share', async () => {
  const { gh } = fakeGh({ declarations: { 'o/flaky': '{ not json' } });
  const roster = await walk(gh, [repo('flaky')]);
  assert.match(coverageView(roster).unknown[0], /^o\/flaky — unparsable/);
  assert.match(freshnessView(roster).unknown[0], /^o\/flaky — unparsable/);
  // and it is in no other bucket of either view
  assert.deepEqual(coverageView(roster).covered, []);
  assert.deepEqual(freshnessView(roster).gone, []);
});

test('a failed mount probe is unknown to freshness ALONE — coverage keeps its verdict', async () => {
  // The one behaviour the merge changes. Separately, a compare outage failed the
  // freshness run and left the census, in its own run, reporting the repo fine with
  // nothing connecting the two. Now one report says both things at once.
  const { gh } = fakeGh({
    declarations: { 'o/alpha': declOf('abc') },
    schedulers: ['o/alpha'],
    errors: { '/repos/o/Claudinite/compare/abc...main?per_page=1': 500 },
  });
  const roster = await walk(gh, [repo('alpha')]);
  assert.deepEqual(coverageView(roster).covered, ['o/alpha'], 'its declaration was read fine');
  assert.deepEqual(coverageView(roster).unknown, []);
  assert.match(freshnessView(roster).unknown[0], /^o\/alpha — comparing abc/);
  assert.deepEqual(freshnessView(roster).fresh, []);
});

// --- the freshness verdict reaches the view -----------------------------------

test('a measured member carries its freshness verdict through to the view', async () => {
  const { gh } = fakeGh({
    declarations: { 'o/alpha': declOf('abc'), 'o/late': declOf('old', {}, { engineVersion: 3 }) },
    schedulers: ['o/alpha', 'o/late'],
    compares: {
      abc: { status: 'identical' },
      // The healthy member's ref is the OLDER of the two and canon has moved far past
      // it: on a date measure that is what "behind" looked like, and it is fresh.
      old: { status: 'ahead' },
    },
  });
  const roster = await walk(gh, [repo('alpha'), repo('late')]);
  const f = freshnessView(roster);
  assert.deepEqual(f.fresh, [{ fullName: 'o/alpha', detail: 'engine v4, 1 declared pack(s) at canon versions' }]);
  assert.equal(f.unhealthy.length, 1);
  assert.equal(f.unhealthy[0].fullName, 'o/late');
  assert.equal(f.unhealthy[0].state, 'behind');
  // both are covered members to the other question
  assert.deepEqual(coverageView(roster).covered, ['o/alpha', 'o/late']);
});

test('a member with no scheduler is reported by root cause, not by its downstream staleness', async () => {
  const { gh } = fakeGh({
    declarations: { 'o/cronless': declOf('old', {}, { engineVersion: 1 }) },
    compares: { old: { status: 'ahead' } },
  });
  const roster = await walk(gh, [repo('cronless')]);
  assert.equal(freshnessView(roster).unhealthy[0].state, 'no-scheduler');
});
