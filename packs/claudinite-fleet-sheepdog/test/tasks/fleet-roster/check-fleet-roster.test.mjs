import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoster, coverageView, freshnessView,
} from '../../../tasks/fleet-roster/check-fleet-roster.mjs';
import { canonVersions } from '../../../tasks/fleet-roster/freshness.mjs';

// The merged walk (#788). What is worth locking down is not that the two questions
// still get answered — their own modules' tests cover that — but that the walk reads
// each repo ONCE and that the two views can still disagree about what it found. The
// disagreements below are the ones the two separate sweeps used to reach by accident;
// here they are deliberate, and a test says so.

const HOME = 'o/enforcer';
const CANON = 'o/Claudinite';

const CANON_SOURCE = {
  'engine/version.mjs': 'export const ENGINE_VERSION = 4;\n',
  'packs/acme-pack/pack.mjs': "export default {\n  id: 'acme-pack',\n  version: 7,\n};\n",
};

const repo = (name, over = {}) => ({ name, full_name: `o/${name}`, archived: false, fork: false, ...over });

// A fake API over declarations, scheduler-workflow presence and canon's own version
// numbers. Records every path so "read once" is an assertion rather than a claim.
//
// It serves the CURRENT settings-file name only: every member here has run the
// rename record, and a read of the retired name 404s exactly as it would in the
// fleet. `legacyDeclarations` is the other side, for the members that have not.
function fakeGh({ declarations = {}, legacyDeclarations = {}, schedulers = [], errors = {} } = {}) {
  const seen = [];
  const gh = async (path) => {
    seen.push(path);
    if (errors[path]) return { status: errors[path], json: null };

    const served = (decl) => ({ status: 200, json: { content: Buffer.from(typeof decl === 'string' ? decl : JSON.stringify(decl)).toString('base64'), sha: 'sha' } });
    let m = /^\/repos\/(.+)\/contents\/\.claudinite-settings\.json$/.exec(path);
    if (m) return declarations[m[1]] === undefined ? { status: 404, json: null } : served(declarations[m[1]]);
    m = /^\/repos\/(.+)\/contents\/\.claudinite-checks\.json$/.exec(path);
    if (m) return legacyDeclarations[m[1]] === undefined ? { status: 404, json: null } : served(legacyDeclarations[m[1]]);

    m = /^\/repos\/(.+)\/contents\/\.github\/workflows\/claudinite-scheduler\.yml$/.exec(path);
    if (m) return { status: schedulers.includes(m[1]) ? 200 : 404, json: { content: '' } };

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

// `current` records exactly what CANON_SOURCE says; anything lower is a gap.
const declOf = (over = {}, { engineVersion = 4, packVersion = 7 } = {}) => ({
  packs: [{ id: 'acme-pack', version: packVersion }],
  engineVersion,
  ...over,
});

// A member whose SCHEDULER is dormant. The declaration says so where the scheduler's
// parameters live — on the tasks pack entry — which is the shape every reader resolves.
const dormantDeclOf = (versions = {}) => {
  const d = declOf({}, versions);
  return { ...d, packs: [...d.packs, { id: 'claudinite-tasks', config: { dormant: true } }] }; // @real-entity dormancy is that pack's own setting
};

// --- the walk reads each repo once --------------------------------------------

test('buildRoster: the declaration is read once per repo, and both questions use that one read', async () => {
  const { gh, seen } = fakeGh({
    declarations: { 'o/alpha': declOf() },
    schedulers: ['o/alpha'],
  });
  await walk(gh, [repo('alpha')]);
  const declReads = seen.filter((p) => p.endsWith('.claudinite-settings.json'));
  assert.equal(declReads.length, 1, 'the two questions shared one declaration read — this is the merge');
  // The per-member canon compare is gone with the ref it compared (#1252): freshness
  // is a version comparison, so a read per member for a state that can no longer
  // happen is a read nobody needs.
  assert.equal(seen.length, 4, 'declaration + scheduler workflow + canon engine + canon acme-pack');
});

// THE RENAME'S WINDOW (#1252). A member is a member under either settings-file name
// until its own converge runs the record — and this sweep is what tells the fleet
// which repos are covered. Read only the current name and every un-converged member
// drops out as uncovered, which reads as a fleet losing adoption overnight.
test('buildRoster: a member still carrying the retired settings-file name is measured normally', async () => {
  const { gh } = fakeGh({
    legacyDeclarations: {
      'o/old-name': { packs: [{ id: 'acme-pack' }], claudinite: { engineVersion: 4, packVersions: { 'acme-pack': 7 } } },
    },
    schedulers: ['o/old-name'],
  });
  const roster = await walk(gh, [repo('old-name')]);
  assert.deepEqual(coverageView(roster).covered, ['o/old-name']);
  assert.deepEqual(freshnessView(roster).fresh.map((f) => f.fullName), ['o/old-name']);
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

test('buildRoster: canon and uncovered repos are read but never probed', async () => {
  // Each is covered-or-not by the coverage question and out of the freshness one, so
  // the two extra reads would be spent on an answer nothing consumes.
  const { gh, seen } = fakeGh({ declarations: { 'o/Claudinite': declOf() } });
  await walk(gh, [repo('Claudinite'), repo('naked')]);
  // `o/naked` is a repo with no declaration at all, so it is read under BOTH
  // settings-file names before it can be called uncovered — the rename's cost, and
  // the alternative is calling a pre-rename member un-adopted.
  assert.deepEqual(seen.filter((p) => !/\.claudinite-(settings|checks)\.json$/.test(p)), [],
    'no scheduler read for any repo the freshness question does not measure');
  assert.equal(seen.length, 3);
});

test('buildRoster: an ignored repo is not read at all', async () => {
  // "Ignore all aspects" (owner, 2026-09-13): the sweep does not even learn whether an
  // ignored repo carries a declaration, so it can make no verdict about one.
  const { gh, seen } = fakeGh({ declarations: { 'o/left-out': declOf() } });
  await walk(gh, [repo('left-out')], { exclude: new Set(['o/left-out']) });
  assert.deepEqual(seen, []);
});

// --- the two views disagree, on purpose ---------------------------------------

test('an ignored repo carries no verdict in either view, declaration or not', async () => {
  // Both halves name it once and say nothing else about it: an ignored repo is out of
  // the coverage question as much as the freshness one, whether or not it happens to
  // mount Claudinite.
  for (const declarations of [{ 'o/left-out': declOf() }, {}]) {
    const { gh } = fakeGh({ declarations });
    const roster = await walk(gh, [repo('left-out')], { exclude: new Set(['o/left-out']) });
    const c = coverageView(roster);
    assert.deepEqual(c.ignored, ['o/left-out']);
    assert.deepEqual([...c.covered, ...c.dormant, ...c.uncovered, ...c.skipped, ...c.unknown], []);
    const f = freshnessView(roster);
    assert.deepEqual(f.ignored, ['o/left-out']);
    assert.deepEqual([...f.fresh, ...f.unhealthy, ...f.dormant, ...f.outOfScope, ...f.unknown], []);
  }
});

test('canon is an ordinary covered member to coverage, and never measured by freshness', async () => {
  const { gh } = fakeGh({ declarations: { 'o/Claudinite': declOf() } });
  const roster = await walk(gh, [repo('Claudinite')]);
  assert.deepEqual(coverageView(roster).covered, ['o/claudinite']);
  const f = freshnessView(roster);
  assert.deepEqual([...f.fresh, ...f.unhealthy, ...f.outOfScope, ...f.dormant], [],
    'canon has no vendored mount to be stale — it is named in the summary, not bucketed');
});

test('a dormant member is covered and counted dormant by both views', async () => {
  const { gh } = fakeGh({ declarations: { 'o/asleep': dormantDeclOf() }, schedulers: ['o/asleep'] });
  const roster = await walk(gh, [repo('asleep')]);
  assert.deepEqual(coverageView(roster).dormant, ['o/asleep']);
  assert.deepEqual(coverageView(roster).covered, []);
  assert.deepEqual(freshnessView(roster).dormant, ['o/asleep']);
});

test('a dormant member is not measured for freshness, however far behind it is', async () => {
  // Owner, 2026-09-13: nothing converges a dormant member and no fleet operation
  // touches one, so an update verdict on its mount is a finding nobody owns. It is
  // named as dormant and nothing else is claimed.
  const { gh, seen } = fakeGh({
    declarations: { 'o/asleep': dormantDeclOf({ engineVersion: 2, packVersion: 3 }) },
    schedulers: ['o/asleep'],
  });
  const f = freshnessView(await walk(gh, [repo('asleep')]));
  assert.deepEqual(f.unhealthy, []);
  assert.deepEqual(f.fresh, []);
  assert.deepEqual(f.dormant, ['o/asleep']);
  assert.deepEqual(seen.filter((p) => !/\.claudinite-(settings|checks)\.json$/.test(p)), [],
    'and the mount probe is not even paid for');
});

test('an AWAKE member with no scheduler workflow is still the no-scheduler finding', async () => {
  // The contrast case for the exit above: a repo that never declared itself dormant
  // and has no cron cannot converge, and that is a finding.
  const { gh } = fakeGh({ declarations: { 'o/awake': declOf() }, schedulers: [] });
  const awake = freshnessView(await walk(gh, [repo('awake')]));
  assert.deepEqual(awake.unhealthy.map((u) => u.state), ['no-scheduler']);
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
  assert.deepEqual(freshnessView(roster).outOfScope, []);
});

test('a failed mount probe is unknown to freshness ALONE — coverage keeps its verdict', async () => {
  // The one behaviour the merge changes. Separately, an outage on one of the mount
  // reads failed the freshness run and left the census, in its own run, reporting the
  // repo fine with nothing connecting the two. Now one report says both things at once.
  const { gh } = fakeGh({
    declarations: { 'o/alpha': declOf() },
    schedulers: ['o/alpha'],
    errors: { '/repos/o/alpha/contents/.github/workflows/claudinite-scheduler.yml': 500 },
  });
  const roster = await walk(gh, [repo('alpha')]);
  assert.deepEqual(coverageView(roster).covered, ['o/alpha'], 'its declaration was read fine');
  assert.deepEqual(coverageView(roster).unknown, []);
  assert.match(freshnessView(roster).unknown[0], /^o\/alpha — /);
  assert.deepEqual(freshnessView(roster).fresh, []);
});

// --- the freshness verdict reaches the view -----------------------------------

test('a measured member carries its freshness verdict through to the view', async () => {
  const { gh } = fakeGh({
    declarations: { 'o/alpha': declOf(), 'o/late': declOf({}, { engineVersion: 3 }) },
    schedulers: ['o/alpha', 'o/late'],
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
    declarations: { 'o/cronless': declOf({}, { engineVersion: 1 }) },
  });
  const roster = await walk(gh, [repo('cronless')]);
  assert.equal(freshnessView(roster).unhealthy[0].state, 'no-scheduler');
});
