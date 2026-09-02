import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleetGrowth } from '../fleet-growth.mjs';
import { decodeUsage } from '../usage.mjs';

const NOW = Date.parse('2026-08-21T11:30:00Z');
const dayKey = (msAgo) => new Date(NOW - msAgo).toISOString().slice(0, 10);

const FIELDS = {
  day: ['captures', 'merges', 'sessions', 'userMessages', 'userCommands', 'ruleTokens', 'ruleTokenSessions'],
  checks: ['runs', 'failures', 'errors', 'blocking', 'advisory', 'ciRuns', 'ciFailures'],
  checkFindings: ['blocking', 'advisory'],
};

// A member whose fold recorded `perDay` check runs and failures on each of the last
// `days` days.
const member = (repo, { days = 10, runs = 3, failures = 1, sessions = 2, ruleTokens = 16000 } = {}) => {
  const rows = {};
  for (let d = 0; d < days; d += 1) {
    rows[dayKey(d * 86400e3)] = {
      totals: [1, 1, sessions, 4, 0, ruleTokens * sessions, sessions],
      checks: { work: [runs, failures, 0, failures, 0, 0, 0] },
    };
  }
  return {
    repo,
    declaration: { packs: [] },
    usage: decodeUsage({ version: 3, generated: null, fields: FIELDS, days: rows, weeks: {}, hours: {} }),
  };
};

test('the fleet series sums the members that folded, per day', () => {
  const g = fleetGrowth([member('o/a'), member('o/b')], { now: NOW, days: 3 });
  assert.deepEqual(g.days.map((d) => d.day), [dayKey(2 * 86400e3), dayKey(86400e3), dayKey(0)]);
  assert.equal(g.days[2].checkRuns, 6, 'two members at three runs each');
  assert.equal(g.days[2].checkFailures, 2);
  assert.equal(g.folding, 2);
  assert.equal(g.members, 2);
});

test('a member that does not fold is NAMED, never averaged in as a quiet repo', () => {
  // The coverage census the retired fleet aggregate carried as `coverage.absent`,
  // derived live: a denominator with an invisible hole in it is worse than none.
  const g = fleetGrowth([
    member('o/folding'),
    { repo: 'o/quiet', declaration: { packs: [] }, usage: null },
    { repo: 'o/unreadable', error: { status: 404 } },
    { repo: 'o/not-adopted', declaration: null },
  ], { now: NOW, days: 3 });
  assert.equal(g.folding, 1);
  assert.equal(g.members, 2, 'a member the page could not read is in neither number');
  assert.deepEqual(g.absent, ['o/quiet']);
  assert.equal(g.days[2].checkRuns, 3, 'the non-folding member contributes nothing rather than zero');
});

test('a day nobody folded is null and marked, so the chart leaves it blank', () => {
  const g = fleetGrowth([member('o/a', { days: 1 })], { now: NOW, days: 3 });
  assert.equal(g.days[0].checkRuns, null);
  assert.equal(g.days[0].source, 'none');
  assert.equal(g.days[2].source, 'folded');
});

test('the window is measured against the window before it, never as a running total', () => {
  const g = fleetGrowth([member('o/a', { days: 20, runs: 2, failures: 1 })], { now: NOW, days: 20, windowDays: 7 });
  assert.equal(g.current.checkRuns, 14, 'seven days at two runs');
  assert.equal(g.previous.checkRuns, 14);
  assert.equal(g.current.checkFailures, 7);
});

test('the corpus a session carries is a mean, and null when nothing attested one', () => {
  const g = fleetGrowth([member('o/a', { days: 10, sessions: 2, ruleTokens: 16000 })], { now: NOW, days: 10 });
  assert.equal(g.tokensPerSession, 16000);

  const noSessions = fleetGrowth([{
    repo: 'o/b',
    declaration: { packs: [] },
    usage: decodeUsage({ version: 3, fields: FIELDS, days: { [dayKey(0)]: { totals: [1, 0, 0, 0, 0] } }, weeks: {}, hours: {} }),
  }], { now: NOW, days: 3 });
  assert.equal(noSessions.tokensPerSession, null, 'no session is not a corpus of zero');
});

test('a fleet where nothing folds reports that, rather than a fleet doing nothing', () => {
  const g = fleetGrowth([{ repo: 'o/a', declaration: { packs: [] }, usage: null }], { now: NOW, days: 3 });
  assert.equal(g.folding, 0);
  assert.equal(g.current.checkRuns, null);
  assert.ok(g.days.every((d) => d.source === 'none'));
});

// --- the corpus panel ---------------------------------------------------------------

import { fleetCorpus, mountedSkills } from '../fleet-growth.mjs';

const CORPUS_FIELDS = {
  day: ['captures', 'merges', 'sessions', 'userMessages', 'userCommands', 'ruleTokens', 'ruleTokenSessions'],
  checks: ['runs', 'failures', 'errors', 'blocking', 'advisory', 'ciRuns', 'ciFailures'],
  checkFindings: ['blocking', 'advisory'],
};

// A member whose every day in range looks the same: `work` and `world` scopes, two
// rules firing, one skill loading, and a tree mounting two skills from one declared pack.
const corpusMember = (repo, { days = 10, work = [4, 1, 0, 2, 0, 0, 0], world = [1, 0, 0, 0, 9, 0, 0], loads = { 'merge-to-main': 2 }, packs = ['basics'], paths = ['.claudinite/shared/packs/basics/skills/merge-to-main/SKILL.md', '.claudinite/shared/packs/basics/skills/bug-investigation/SKILL.md'] } = {}) => {
  const rows = {};
  for (let d = 0; d < days; d += 1) {
    rows[dayKey(d * 86400e3)] = {
      totals: [3, 2, 2, 5, 1, 30000, 2],
      checks: Object.fromEntries(Object.entries({ work, world }).filter(([, v]) => v)),
      checkFindings: { 'reference-integrity': [2, 0], 'file-placement': [0, 9] },
      skillLoads: loads,
    };
  }
  return {
    repo,
    declaration: { packs },
    paths,
    usage: decodeUsage({ version: 3, generated: '2026-08-21T10:00:00Z', foldedThrough: '2026-08-20', fields: CORPUS_FIELDS, days: rows, weeks: {}, hours: {} }),
  };
};

test('the two scopes are summed separately across members, with a catch rate each', () => {
  const c = fleetCorpus([corpusMember('o/a'), corpusMember('o/b')], { now: NOW, days: 10 });
  assert.equal(c.scopes.work.runs, 80, 'two members, ten days, four runs');
  assert.equal(c.scopes.work.failures, 20);
  assert.equal(c.scopes.work.catchRate, 0.25);
  assert.equal(c.scopes.world.advisory, 180);
  assert.equal(c.scopes.world.catchRate, 0, 'ran, caught nothing blocking — a rate of zero, not an unknown');
  assert.equal(c.scopes.work.seen, true);
});

test('a scope no member recorded is unseen, and its rate is null rather than zero', () => {
  const c = fleetCorpus([corpusMember('o/a', { world: null })], { now: NOW, days: 3 });
  assert.equal(c.scopes.world.seen, false);
  assert.equal(c.scopes.world.catchRate, null);
});

test('rules are ranked by what they caught, with how many members each fired in', () => {
  const c = fleetCorpus([corpusMember('o/a'), corpusMember('o/b', { days: 2 })], { now: NOW, days: 10 });
  assert.deepEqual(c.rules.map((r) => r.rule), ['file-placement', 'reference-integrity']);
  assert.equal(c.rules[0].advisory, 108, 'ten days plus two, nine each');
  assert.equal(c.rules[1].blocking, 24);
  assert.equal(c.rules[1].members, 2);
  assert.deepEqual(c.findings, { blocking: 24, advisory: 108 });
});

test('skills: loads per skill against where it is mounted, and the mounted-never-loaded list', () => {
  const c = fleetCorpus([corpusMember('o/a'), corpusMember('o/b', { loads: {} })], { now: NOW, days: 3 });
  assert.deepEqual(c.skills.loaded, [{ skill: 'merge-to-main', loads: 6, members: 1, mountedIn: 2 }]);
  assert.deepEqual(c.skills.neverLoaded, [{ skill: 'bug-investigation', mountedIn: 2 }]);
  assert.equal(c.skills.mountedDistinct, 2);
  assert.equal(c.skills.treesRead, 2);
});

test('a skill from a pack the member has on disk but does not declare is not mounted', () => {
  const paths = [
    'packs/basics/skills/one/SKILL.md',
    'packs/undeclared/skills/two/SKILL.md',
    '.claudinite/local/packs/mine/skills/three/SKILL.md',
    '.claudinite/shared/packs/mine/skills/four/SKILL.md',
  ];
  const got = mountedSkills(paths, { packs: ['basics', { id: 'local/mine' }] });
  assert.deepEqual([...got].sort(), ['one', 'three'], 'the canon root and the local root each count; the undeclared pack and the wrong root do not');
});

test('the workload tiles are this week against last, and a member that does not fold is named', () => {
  const c = fleetCorpus([
    corpusMember('o/a', { days: 20 }),
    { repo: 'o/quiet', declaration: { packs: [] }, usage: null },
  ], { now: NOW, days: 20, windowDays: 7 });
  assert.equal(c.workload.current.sessions, 14);
  assert.equal(c.workload.previous.sessions, 14);
  assert.equal(c.workload.current.userMessages, 35);
  assert.deepEqual(c.absent, ['o/quiet']);
  assert.equal(c.folding, 1);
  assert.equal(c.readable, 2);
});

test('the member rows carry each member\'s own figures, and an absent member is a row that says so', () => {
  const c = fleetCorpus([corpusMember('o/a'), { repo: 'o/quiet', declaration: { packs: [] }, usage: null }], { now: NOW, days: 3 });
  const a = c.members.find((m) => m.repo === 'o/a');
  assert.equal(a.sessions, 6);
  assert.equal(a.turns, 15);
  assert.equal(a.skillLoads, 6);
  assert.equal(a.work.runs, 12);
  assert.equal(a.world.runs, 3);
  assert.equal(a.blocking, 6);
  assert.equal(a.advisory, 27);
  assert.equal(a.tokensPerSession, 15000);
  assert.equal(a.foldedThrough, '2026-08-20');
  const q = c.members.find((m) => m.repo === 'o/quiet');
  assert.equal(q.folding, false);
  assert.equal(q.sessions, undefined, 'nothing is invented for a member that does not fold');
});

test('a day carrying no session count leaves the sum null, never zero', () => {
  const noSessions = {
    repo: 'o/b',
    declaration: { packs: [] },
    usage: decodeUsage({ version: 3, fields: CORPUS_FIELDS, days: { [dayKey(0)]: { totals: [1, 0] } }, weeks: {}, hours: {} }),
  };
  const c = fleetCorpus([noSessions], { now: NOW, days: 3 });
  assert.equal(c.workload.current.sessions, null);
  assert.equal(c.workload.current.captures, 1);
  assert.equal(c.members[0].tokensPerSession, null);
});

// What a TYPICAL member's session carries — the figure one repo's page compares itself
// against, which a number about itself alone cannot give it.
test('the fleet mean of rule tokens per session averages MEMBERS, not sessions', () => {
  const c = fleetCorpus([corpusMember('o/a'), corpusMember('o/b')], { now: NOW, days: 10 });
  // Both fixtures carry 30,000 rule tokens over 2 attesting sessions per day, so each
  // member's own figure is 15,000 and the fleet's is the same.
  assert.equal(c.fleetTokensPerSession.mean, 15000);
  assert.equal(c.fleetTokensPerSession.members, 2, 'a mean of two is a different claim from a mean of twenty');
});

test('a fleet where no member attested a corpus reports no mean, not a mean of zero', () => {
  const c = fleetCorpus([{ repo: 'o/quiet', declaration: { packs: [] }, usage: null }], { now: NOW, days: 3 });
  assert.deepEqual(c.fleetTokensPerSession, { mean: null, members: 0 });
});
