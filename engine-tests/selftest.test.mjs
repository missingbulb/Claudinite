import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  report, probeMount, probeStamp, probePackManifests, probeHookTargets,
  probeSkillLinks, probeScheduler, probeMigrations, MOUNT, CHECKS, SETTINGS, SCHEDULER,
} from '../engine/selftest.mjs';

// An in-memory repo: a path->content map. Absent key = absent file. The probes
// take io injected precisely so the whole set runs with no tree on disk.
const io = (files, dangling = []) => ({
  exists: (p) => Object.keys(files).some((f) => f === p || f.startsWith(`${p}/`)),
  read: (p) => files[p] ?? null,
  dangling: () => dangling,
});

const MEMBER = {
  [`${MOUNT}/engine/checks/check_the_world.mjs`]: '',
  [CHECKS]: JSON.stringify({ claudinite: { updated: '2026-07-30T00:00:00.000Z', ref: 'abc' } }),
};

// --- report ----------------------------------------------------------------

test('report distinguishes not-applicable from failure', () => {
  const r = report([{ id: 'a', ok: true }, { id: 'b', ok: null }, { id: 'c', ok: false, detail: 'x' }]);
  assert.equal(r.ok, false);
  assert.equal(r.ran, 2);        // the skipped probe is not counted as run
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.failures.map((f) => f.id), ['c']);
});

test('report is ok when every probe passed or was skipped', () => {
  const r = report([{ id: 'a', ok: true }, { id: 'b', ok: null }]);
  assert.equal(r.ok, true);
  assert.match(r.summary, /1 probes passed/);
});

// --- mount -----------------------------------------------------------------

test('mount: the canon itself is not-applicable, never a failure', () => {
  assert.equal(probeMount(io({})).ok, null);
});

test('mount: a mount directory with no engine in it fails', () => {
  const p = probeMount(io({ [`${MOUNT}/packs/basics/pack.mjs`]: '' }));
  assert.equal(p.ok, false);
  assert.match(p.detail, /carries no engine/);
});

// --- stamp (#518) ----------------------------------------------------------

test('stamp: a member whose mount carries no stamp fails — this is #518', () => {
  const p = probeStamp(io({ ...MEMBER, [CHECKS]: JSON.stringify({ packs: [] }) }));
  assert.equal(p.ok, false);
  assert.match(p.fix, /self-skip/);
});

test('stamp: unparseable declaration fails with the parse error', () => {
  const p = probeStamp(io({ ...MEMBER, [CHECKS]: '{ not json' }));
  assert.equal(p.ok, false);
  assert.match(p.detail, /not valid JSON/);
});

test('stamp: a healthy member passes', () => {
  assert.equal(probeStamp(io(MEMBER)).ok, true);
});

// --- pack manifests (#555) -------------------------------------------------

test('pack-manifests: a manifest the loader rejected fails, quoting the first error', () => {
  const p = probePackManifests({
    packs: [],
    errors: [{ what: 'the pack in .claudinite/local/packs/tldr: declares no "ruleRoutingGuidance"', fix: 'add it' }],
  });
  assert.equal(p.ok, false);
  assert.match(p.detail, /ruleRoutingGuidance/);
});

test('pack-manifests: discovering no packs at all is a failure, not a pass', () => {
  const p = probePackManifests({ packs: [], errors: [] });
  assert.equal(p.ok, false);
  assert.match(p.detail, /no packs were discovered/);
});

test('pack-manifests: a clean load passes', () => {
  assert.equal(probePackManifests({ packs: [{ id: 'basics' }], errors: [] }).ok, true);
});

// --- hook targets (#397) ---------------------------------------------------

const settings = (command) => JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command }] }] } });

test('hook-targets: a hook pointing at a file that does not exist fails — this is #397', () => {
  const p = probeHookTargets(io({ [SETTINGS]: settings('node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/gone.mjs') }));
  assert.equal(p.ok, false);
  assert.match(p.detail, /gone\.mjs/);
});

test('hook-targets: a hook whose target exists passes', () => {
  const target = '.claudinite/shared/engine/hooks/session-start-command.sh';
  const p = probeHookTargets(io({ [SETTINGS]: settings(`bash $CLAUDE_PROJECT_DIR/${target}`), [target]: '' }));
  assert.equal(p.ok, true);
});

test('hook-targets: no settings file is not-applicable', () => {
  assert.equal(probeHookTargets(io({})).ok, null);
});

// --- skill links (#424) ----------------------------------------------------

test('skill-links: dangling mounted links fail — this is #424', () => {
  const p = probeSkillLinks(io({ '.claude/skills/x/SKILL.md': '' }, ['.claude/skills/x/SKILL.md']));
  assert.equal(p.ok, false);
  assert.match(p.detail, /dangle/);
});

test('skill-links: resolving links pass, and no skills dir is not-applicable', () => {
  assert.equal(probeSkillLinks(io({ '.claude/skills/x/SKILL.md': '' }, [])).ok, true);
  assert.equal(probeSkillLinks(io({})).ok, null);
});

// --- scheduler -------------------------------------------------------------

test('scheduler: a repo that never cut over is not-applicable', () => {
  assert.equal(probeScheduler(io({})).ok, null);
});

test('scheduler: an unparseable cron fails — the repo would never run a task again', () => {
  const p = probeScheduler(io({ [SCHEDULER]: 'on:\n  schedule:\n    - cron: "not a cron"\n' }));
  assert.equal(p.ok, false);
  assert.match(p.detail, /does not parse/);
});

test('scheduler: two crons fail — the scheduler is the repo\'s only cron', () => {
  const p = probeScheduler(io({ [SCHEDULER]: 'on:\n  schedule:\n    - cron: "17 * * * *"\n    - cron: "0 3 * * *"\n' }));
  assert.equal(p.ok, false);
  assert.match(p.detail, /2 cron schedules/);
});

test('scheduler: one hourly hashed-minute cron passes', () => {
  assert.equal(probeScheduler(io({ [SCHEDULER]: 'on:\n  schedule:\n    - cron: "17 * * * *"\n' })).ok, true);
});

// --- migrations ------------------------------------------------------------

test('migrations: a registry that throws fails, quoting the reason', () => {
  const p = probeMigrations(new Error('bad record: 2026-07-30-x.mjs'));
  assert.equal(p.ok, false);
  assert.match(p.detail, /bad record/);
});

test('migrations: a loadable registry passes, and an unreachable one is not-applicable', () => {
  assert.equal(probeMigrations(true).ok, true);
  assert.equal(probeMigrations(null).ok, null);
});
