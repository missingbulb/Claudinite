import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import pack from '../pack.mjs';

const run = promisify(execFile);

// The install runner exits non-zero when the converged tree fails its self-test, which
// a bare temp directory always does — no git, no mount. These tests assert on what it
// REPORTS, so the exit code is not the subject and stdout is read either way.
const runReporting = async (...args) => {
  try { return await run(...args); } catch (e) { return { stdout: e.stdout ?? '', stderr: e.stderr ?? '' }; }
};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PACK_DIR = join(ROOT, 'packs/claudinite-dashboard');

// --- the manifest ----------------------------------------------------------------

test('the pack is opt-in and never fingerprinted', () => {
  // Nothing in a repo's shape implies wanting a dashboard. A fingerprint would suspect
  // one in every member on the fleet, since every member has a scheduler. Silence IS
  // that statement: the manifest declares neither field, and the loader resolves an
  // undeclared fingerprint to null.
  assert.equal(pack.detect, undefined);
  assert.equal(pack.marker, undefined);
  assert.equal(pack.seededByDefault, false);
});

test('it costs no session prose, and its checks guard the digest and the descriptors', () => {
  // A page is not a practice: there is no way to write the dashboard wrongly in a
  // consuming repo, and prose here would bill every session in every declaring repo.
  // No RULES.md beside the manifest is what says so — the loader derives prose from
  // that file's presence, so its absence is the declaration.
  assert.equal(existsSync(join(PACK_DIR, 'RULES.md')), false);
  assert.equal(pack.prose, undefined);
  // Two arrived with the fleet-digest task and guard its output and its own fixtures.
  // The third guards what OTHER packs contribute to this page — a descriptor the
  // reader rejects fails silently, in a viewer's browser, where its author never
  // looks. All three are world rules: each audits what has landed, whatever this
  // session touched.
  // They are the modules in the pack's own worldRules/ — the directory is the
  // declaration, so the directory is what this asserts.
  assert.deepEqual(readdirSync(join(PACK_DIR, 'worldRules')).sort(),
    ['dated-fixture-collision.mjs', 'descriptor-usable.mjs', 'digest-plain-text.mjs']);
  assert.equal(existsSync(join(PACK_DIR, 'workRules')), false);
});

// The cost of declaring this pack, stated as a test because it is the thing an adopter
// is most likely to be surprised by: the page comes with a daily task that reads every
// repo under the owner, and that task cannot run without the fleet PAT.
test('declaring the pack brings the fleet-digest task, and it names the secret it needs', async () => {
  const task = (await import(join(PACK_DIR, 'tasks/fleet-digest/task.mjs'))).default;
  assert.equal(task.id, 'fleet-digest');
  // The `daily+1h` offset retired with the twice-daily cron; the ordering it wished for is
  // `schedule_after:` now, which actually enforces it (tasks-dispatch DESIGN §17.1).
  assert.equal(task.frequency, 'daily');
  assert.deepEqual(task.schedule_after, [
    'claudinite-fleet-sheepdog/fleet-roster',
    'claudinite-fleet-sheepdog/fleet-usage',
    'claudinite-fleet-sheepdog/fleet-pack-seeds',
  ]);
  assert.deepEqual(task.required_secrets, ['FLEET_GITHUB_TOKEN']);
});

// The whole point of the remodel: adoption is what wires the deploy, because
// `.github/workflows/` cannot be written by the nightly and so can only be seeded.
test('adoption seeds the Pages workflow, and its template exists', async () => {
  assert.equal(pack.seedOps.length, 1);
  const [op] = pack.seedOps;
  assert.equal(op.dest, '.github/workflows/claudinite-dashboard-pages.yml');
  assert.ok(existsSync(join(PACK_DIR, op.template)), `seedOp template missing: ${op.template}`);
});

// A seeded workflow never converges, so anything it hardcodes is frozen in every
// member forever. It must therefore call the mount, not carry the logic.
test('the seeded workflow is a shim over the mount, holding no build logic', async () => {
  const yml = await readFile(join(PACK_DIR, pack.seedOps[0].template), 'utf8');
  assert.match(yml, /node \.claudinite\/shared\/packs\/claudinite-dashboard\/build-site\.mjs/);
  assert.doesNotMatch(yml, /\bcp -r\b|\brsync\b/, 'the workflow must not stage files itself');
  // Configuration lives in the declaration, so the frozen file has none to go stale.
  assert.doesNotMatch(yml, /vars\.DASHBOARD_/, 'settings belong in .claudinite-checks.json, not in the frozen stub');
});

// The catch-up trigger, and the one string in it this pack does not own. A push that
// moves a member's mount is made by the Actions token, which fires no workflow — so
// the deploy hangs off the vendored scheduler finishing instead. `workflow_run` names
// that workflow by its DISPLAY NAME, and a name that does not match any workflow is
// not an error: the trigger simply never fires, and the site quietly stops being
// republished. Which is the exact failure this trigger was added to fix.
test('the seeded workflow follows the scheduler, by a name the engine actually ships', async () => {
  const yml = await readFile(join(PACK_DIR, pack.seedOps[0].template), 'utf8');
  const named = /workflow_run:\s*\n\s*workflows:\s*\['([^']+)'\]/.exec(yml);
  assert.ok(named, 'the stub must follow the scheduler rather than declare a cron of its own');

  const schedulerRun = await readFile(resolve(ROOT, 'engine/scheduler/stubs/claudinite-scheduler.yml'), 'utf8');
  assert.match(schedulerRun, new RegExp(`^name:\\s*${named[1]}\\s*$`, 'm'),
    `the stub follows "${named[1]}", which no engine stub declares`);
});

// The repo's own rule, and the reason this is a `workflow_run` and not a `cron`: the
// vendored scheduler is a member's ONE permitted schedule.
test('the seeded workflow declares no cron of its own', async () => {
  const yml = await readFile(join(PACK_DIR, pack.seedOps[0].template), 'utf8');
  assert.doesNotMatch(yml, /^\s*schedule:/m,
    'a second cron competes with the scheduler that owns every recurring job');
});

test('the build script is NOT seeded — it has to keep converging', () => {
  const dests = pack.seedOps.map((o) => o.dest);
  assert.ok(!dests.some((d) => d.includes('build-site')), 'build-site.mjs must stay in the mount');
});

// --- build-site, against a simulated member mount ----------------------------------

// Stand up a member the way a converge leaves one: the pack and the engine side by
// side under `.claudinite/shared/`. The relative imports the page uses resolve only
// if that shape is right, so building here is what proves the shape.
async function member(declaration, extraFiles = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cd-member-'));
  await mkdir(join(dir, '.claudinite/shared/packs'), { recursive: true });
  await cp(join(ROOT, 'engine'), join(dir, '.claudinite/shared/engine'), { recursive: true });
  // As the vendor set lays it down: a pack's tests sit beside the files they cover and
  // are dropped on the way into a mount, so a fixture that copied them would be staging
  // a tree no member ever has.
  await cp(PACK_DIR, join(dir, '.claudinite/shared/packs/claudinite-dashboard'),
    { recursive: true, filter: (src) => !src.endsWith('.test.mjs') });
  await writeFile(join(dir, '.claudinite-checks.json'), JSON.stringify(declaration));
  for (const [name, body] of Object.entries(extraFiles)) await writeFile(join(dir, name), body);
  return dir;
}

const build = (dir, env = {}) => run('node',
  ['.claudinite/shared/packs/claudinite-dashboard/build-site.mjs'],
  { cwd: dir, env: { ...process.env, ...env } });

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const CONFIG_AT = '_site/packs/claudinite-dashboard/dashboard.config.json';

test('a bare declaration builds this repo\'s own dashboard', async (t) => {
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));

  await build(dir, { GITHUB_REPOSITORY: 'o/mine' });
  const cfg = await readJson(join(dir, CONFIG_AT));
  assert.equal(cfg.mode, 'repo', 'the page is told which dashboard it is, never left to infer it');
  assert.equal(cfg.defaultRepo, 'o/mine');
  assert.equal(cfg.rosterUrl, null, 'no roster means no fleet view');
  assert.equal(cfg.clientId, null);
});

// The layout the page's relative imports depend on. Flattening it would send
// `../../engine/...` above the site root and the page would not boot.
test('the staged tree mirrors the mount, with the root a redirect', async (t) => {
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build(dir);

  for (const p of [
    '_site/index.html',
    '_site/packs/claudinite-dashboard/index.html',
    '_site/packs/claudinite-dashboard/model.mjs',
    '_site/engine/scheduler/queue/work-item.mjs',
    '_site/engine/checks/helpers/code-scanning.mjs',
    '_site/.nojekyll',
  ]) assert.ok(existsSync(join(dir, p)), `missing from the staged site: ${p}`);

  const root = await readFile(join(dir, '_site/index.html'), 'utf8');
  assert.match(root, /url=\.\/packs\/claudinite-dashboard\//);
});

// Every relative import the page makes must resolve inside the staged tree — the
// check that would have caught the flattening bug without a browser.
test('every relative import in the staged page resolves inside the site', async (t) => {
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build(dir);

  const pageDir = join(dir, '_site/packs/claudinite-dashboard');
  const { stdout } = await run('sh', ['-c', `grep -ho "from '[^']*'" ${pageDir}/*.mjs | sort -u`]);
  const specs = stdout.split('\n').map((l) => /from '([^']*)'/.exec(l)?.[1]).filter((x) => x?.startsWith('.'));
  assert.ok(specs.length > 0, 'found no relative imports — the grep is wrong, not the page');
  for (const spec of specs) {
    assert.ok(existsSync(resolve(pageDir, spec)), `staged page imports ${spec}, which is not in the site`);
  }
});

test('local-only and explanatory files are not published', async (t) => {
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build(dir);

  for (const f of ['serve.mjs', 'build-site.mjs', 'pack.mjs', 'README.md', 'stubs', 'oauth-exchange.example.mjs']) {
    assert.ok(!existsSync(join(dir, '_site/packs/claudinite-dashboard', f)), `${f} must not be published`);
  }
});

test('a roster file turns on the fleet view and publishes only the names', async (t) => {
  const dir = await member(
    { packs: [{ id: 'claudinite-dashboard', config: { mode: 'fleet', rosterFile: 'fleet.json', canonRepo: 'o/canon' } }] },
    { 'fleet.json': JSON.stringify({ repos: { 'o/a': { tonnes: 'of stats' }, 'o/b': {} } }) },
  );
  t.after(() => rm(dir, { recursive: true, force: true }));
  await build(dir);

  const cfg = await readJson(join(dir, CONFIG_AT));
  assert.equal(cfg.mode, 'fleet');
  assert.equal(cfg.rosterUrl, './fleet-roster.GENERATED.json');
  assert.equal(cfg.canonRepo, 'o/canon');
  assert.equal(cfg.defaultRepo, null, 'a fleet deployment lands on the overview, not inside one member');

  const roster = await readJson(join(dir, '_site/packs/claudinite-dashboard/fleet-roster.GENERATED.json'));
  assert.deepEqual(roster.repos, ['o/a', 'o/b']);
  assert.equal(JSON.stringify(roster).includes('tonnes'), false, 'only the names travel');
});

// Saying so matters: the site would otherwise publish as a single-repo dashboard and
// look entirely intentional.
test('an unreadable roster file warns instead of silently covering one repo', async (t) => {
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'fleet', rosterFile: 'absent.json' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await build(dir);
  assert.match(stdout, /WARNING: rosterFile absent\.json could not be read/);
  const cfg = await readJson(join(dir, CONFIG_AT));
  assert.equal(cfg.rosterUrl, null);
  // And it stays a FLEET page. The declaration said so; an unreadable roster is a fleet
  // whose members could not be listed, which is what the warning is for — it is not a
  // reason to publish a different dashboard than the one that was asked for.
  assert.equal(cfg.mode, 'fleet');
});

test('sign-in needs both halves, and the build says which is missing', async (t) => {
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo', clientId: 'Iv1.x' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await build(dir);
  assert.match(stdout, /sign-in: NOT configured/);
  assert.match(stdout, /exchangeUrl missing/);
});

// An adopted-but-not-yet-converged member is the ordinary state on a fleet, not a
// fault. Failing here would paint every run red until the converge caught up.
test('a mount without the page produces nothing and exits clean', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cd-bare-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, '.claudinite/shared/packs/claudinite-dashboard'), { recursive: true });
  for (const f of ['build-site.mjs', 'config.mjs']) {
    await cp(join(PACK_DIR, f), join(dir, `.claudinite/shared/packs/claudinite-dashboard/${f}`));
  }
  await writeFile(join(dir, '.claudinite-checks.json'), JSON.stringify({ packs: ['claudinite-dashboard'] }));

  const { stdout } = await build(dir);
  assert.match(stdout, /nothing to publish/i);
  assert.equal(existsSync(join(dir, '_site')), false);
});

// --- the mode, which the build refuses to guess ---------------------------------------

// The behaviour this replaces: a declaration that said nothing published as this repo's
// own page. That is fine when it is what the deployer meant and silently wrong when it
// is not — a fleet deployment whose roster source was dropped or misspelled published a
// one-repo dashboard that looked entirely intentional. So the build now refuses, and the
// deployment says which dashboard it is.
test('a declaration that states no mode publishes nothing and says why', async (t) => {
  const dir = await member({ packs: ['claudinite-dashboard'] });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const res = await build(dir, { GITHUB_REPOSITORY: 'o/x' }).catch((e) => e);
  assert.ok(res instanceof Error, 'the build must fail, not publish a guess');
  assert.match(String(res.stderr ?? res.message), /does not say which dashboard it is/);
  assert.equal(existsSync(join(dir, CONFIG_AT)), false, 'and nothing is published');
});

test('a repo with no declaration at all is refused for the same reason', async (t) => {
  // Previously this built a repo page. Nothing states a mode here either, and "no
  // declaration" is a less deliberate silence than an empty config, not a more one.
  const dir = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo' } }] });
  t.after(() => rm(dir, { recursive: true, force: true }));
  await rm(join(dir, '.claudinite-checks.json'));

  const res = await build(dir, { GITHUB_REPOSITORY: 'o/x' }).catch((e) => e);
  assert.ok(res instanceof Error);
  assert.match(String(res.stderr ?? res.message), /does not say which dashboard it is/);
});

test('a mode that contradicts the config is refused too, in both directions', async (t) => {
  const fleetNoRoster = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'fleet' } }] });
  t.after(() => rm(fleetNoRoster, { recursive: true, force: true }));
  const a = await build(fleetNoRoster).catch((e) => e);
  assert.match(String(a.stderr ?? a.message), /names no roster source/);

  const repoWithOwner = await member({ packs: [{ id: 'claudinite-dashboard', config: { mode: 'repo', owner: 'o' } }] });
  t.after(() => rm(repoWithOwner, { recursive: true, force: true }));
  const b = await build(repoWithOwner).catch((e) => e);
  assert.match(String(b.stderr ?? b.message), /roster source/);
});

// --- the handover -------------------------------------------------------------------

// Enabling Pages cannot be automated: `actions/configure-pages`' `enablement` input
// needs a PAT with `repo` or an app with `administration:write`, never the Action's own
// GITHUB_TOKEN — and holding a credential that wide in every member to save one click
// is a worse trade than naming the click. So it must be declared, not just documented.
test('the pack declares its human-only step in the shape the rule requires', () => {
  assert.ok(Array.isArray(pack.adoptionHandover) && pack.adoptionHandover.length >= 1);
  for (const h of pack.adoptionHandover) {
    assert.match(h.step, /\S/, 'a handover step needs a step');
    assert.match(h.breaks, /\S/, 'and what breaks while it is off');
    assert.match(h.done, /\S/, 'and a closing condition');
  }
  assert.match(pack.adoptionHandover[0].step, /Pages/i);
});

// The second human-only step, and the one an adopter would otherwise meet as "why is
// this page rate-limited". Sign-in cannot be automated for the same reason Pages
// cannot: registering an app and hosting the code-to-token exchange are a console and
// a credential, and neither is inheritable from the fleet that wrote this pack.
//
// It is ONE entry deliberately. For a member reading its own repo through a pasted
// token the answer is "nothing to do" at the identical 5,000/hour, so four
// unconditional checkboxes would be mostly no-ops — which is what teaches a reader to
// skim the list that exists to stop them skimming. The decision is what every adopter
// owes; the mechanics live in the README.
test('the pack hands over the sign-in decision, not just the Pages setting', () => {
  const signin = pack.adoptionHandover.find((h) => /sign in|authenticat/i.test(h.step));
  assert.ok(signin, 'no handover entry covers how viewers authenticate');
  assert.match(signin.step, /clientId/, 'it names the pair that actually turns the button on');
  assert.match(signin.step, /README/i, 'and points at where the mechanics are');
  // The trap this guards: an entry that reads as mandatory when the deployment may
  // legitimately have nothing to do.
  assert.match(signin.step, /nothing to do|leave it/i, 'the do-nothing answer is stated as an answer');
  assert.match(signin.breaks, /60 requests\/hour|anonymous/i, 'what being undone actually costs');
  assert.match(signin.done, /5000|token box/, 'and something that can close it either way');
});

// The point of the field over a README line: a README is read after the deploy has
// already failed. This asserts the install flow actually surfaces it.
test('the install flow reports the handover so adoption cannot miss it', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cd-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '.claudinite-checks.json'), JSON.stringify({ packs: [] }, null, 2));

  const { stdout } = await runReporting('node',
    [join(ROOT, 'updates/install.mjs'), '--target', dir, 'claudinite-dashboard'],
    { cwd: ROOT });

  assert.match(stdout, /only a human can do/, 'the handover is printed');
  assert.match(stdout, /\[ \] \(claudinite-dashboard\) Enable GitHub Pages/);
  assert.match(stdout, /\[ \] \(claudinite-dashboard\) Decide how this dashboard authenticates/);
  assert.match(stdout, /while off:/);
  assert.match(stdout, /done when:/);
  // And the thing it is a handover FOR actually landed.
  assert.match(stdout, /seeded \.github\/workflows\/claudinite-dashboard-pages\.yml/);
});

// A pack with nothing to hand over must not print an empty section.
test('a pack with no handover prints none', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'cd-install2-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '.claudinite-checks.json'), JSON.stringify({ packs: [] }, null, 2));

  const { stdout } = await runReporting('node',
    [join(ROOT, 'updates/install.mjs'), '--target', dir, 'html'],
    { cwd: ROOT });
  assert.doesNotMatch(stdout, /only a human can do/);
});
