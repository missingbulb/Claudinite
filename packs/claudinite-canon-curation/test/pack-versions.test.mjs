import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  isShippingFile, declaredPackVersion, withPackVersion, shelfPacks, bumpCommits, planBumps,
  versionHistory, renderHistory, planHistory, rowVersions, pullNumber, BUMP_TASK,
} from '../pack-versions.mjs';
import { run, makeGit, pushOnto } from '../tasks/pack-version-bump/worker.mjs';
import { removeTree } from '../../../engine/remove-tree.mjs';

// What is pinned: the version number is read OFF the base branch after a merge, never
// written by the pull request — so the walk must find the last bump, count only
// shipping bytes since it, and cut one fresh number per pack per pass, with the bump
// commit itself never counted as content a version shipped.

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'gc.autoDetach', GIT_CONFIG_VALUE_0: 'false',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_KEY_2: 'commit.gpgsign', GIT_CONFIG_VALUE_2: 'false',
};

function sh(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const manifest = (version) => `export default {\n  version: '${version}',\n  minEngineVersion: '60822.1',\n};\n`;

function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

// One landed change on main: `subject` is the squash-merge subject, so it carries
// the pull request number the history reads back.
function land(work, subject, files, { date = '2026-09-01T12:00:00Z', trailer = null } = {}) {
  write(work, files);
  sh(work, 'add', '-A');
  const message = trailer ? `${subject}\n\nClaudinite-Task: ${trailer}\n` : subject;
  const r = spawnSync('git', ['commit', '--quiet', '-m', message], {
    cwd: work, encoding: 'utf8', env: { ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  assert.equal(r.status, 0, r.stderr);
  sh(work, 'push', '--quiet', 'origin', 'main');
  return sh(work, 'rev-parse', 'HEAD').trim();
}

// A shelf of two packs on main, with the shapes the walk has to tell apart: content
// landed without a bump (alpha), a test-only change (alpha), and an old-style pull
// request that bumped itself beside its content (beta).
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-pack-versions-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  mkdirSync(origin); mkdirSync(work);
  sh(origin, 'init', '--bare', '--quiet', '--initial-branch=main');
  sh(work, 'init', '--quiet', '--initial-branch=main');
  sh(work, 'config', 'user.email', 't@t');
  sh(work, 'config', 'user.name', 't');
  sh(work, 'remote', 'add', 'origin', origin);
  const shas = {};
  shas.seed = land(work, 'Seed the shelf (#1)', {
    'README.md': '# repo\n',
    'packs/alpha/pack.mjs': manifest('60901.1'),
    'packs/alpha/RULES.md': '# alpha\n',
    'packs/beta/pack.mjs': manifest('60901.1'),
    'packs/beta/RULES.md': '# beta\n',
  }, { date: '2026-09-01T10:00:00Z' });
  shas.alphaRule = land(work, 'Teach alpha a rule (#10)', { 'packs/alpha/RULES.md': '# alpha\n\n- a rule\n' }, { date: '2026-09-02T10:00:00Z' });
  shas.alphaTest = land(work, 'Cover alpha (#11)', { 'packs/alpha/test/alpha.test.mjs': 'test\n' }, { date: '2026-09-02T11:00:00Z' });
  shas.betaSelf = land(work, 'Beta bumps itself the old way (#12)', {
    'packs/beta/pack.mjs': manifest('60902.1'),
    'packs/beta/RULES.md': '# beta\n\n- a rule\n',
  }, { date: '2026-09-02T12:00:00Z' });
  return { dir, origin, work, shas };
}

const TODAY = new Date('2026-09-05T15:00:00Z');
const quiet = () => {};

// `versionHistory` dates a row by the bump COMMIT's committer date, which the worker
// takes from the wall clock — so a fixture that lets it commit unpinned asserts the
// day the suite happens to run on, and every date expectation below goes red at the
// next UTC midnight. Hand `run` a git that commits at TODAY, the day those versions
// are cut on.
const gitAtToday = (root) => {
  const git = makeGit(root);
  const env = { ...GIT_ENV, GIT_AUTHOR_DATE: TODAY.toISOString(), GIT_COMMITTER_DATE: TODAY.toISOString() };
  return (args, opts = {}) => git(args, { env, ...opts });
};

test('isShippingFile: pack content ships; tests, the record and a repo\'s own packs do not', () => {
  assert.equal(isShippingFile('packs/alpha/RULES.md'), true);
  assert.equal(isShippingFile('packs/alpha/pack.mjs'), true);
  assert.equal(isShippingFile('packs/alpha/skills/x/SKILL.md'), true);
  assert.equal(isShippingFile('packs/alpha/test/alpha.test.mjs'), false);
  assert.equal(isShippingFile('packs/alpha/VERSIONS.md'), false);
  assert.equal(isShippingFile('.claudinite/local/packs/mine/RULES.md'), false);
  assert.equal(isShippingFile('packs/README.md'), false);
  assert.equal(isShippingFile('engine/version.mjs'), false);
});

test('declaredPackVersion reads `version:` and not `minEngineVersion:`; withPackVersion moves only that literal', () => {
  const text = manifest('60901.1');
  assert.equal(declaredPackVersion(text), '60901.1');
  const bumped = withPackVersion(text, '60905.1');
  assert.equal(declaredPackVersion(bumped), '60905.1');
  assert.match(bumped, /minEngineVersion: '60822\.1'/);
  assert.equal(bumped.replace("'60905.1'", "'60901.1'"), text);
  assert.equal(declaredPackVersion('export default {}'), null);
});

test('bumpCommits: every first-parent commit that moved a pack\'s version, newest first, the introduction included', () => {
  const { dir, work, shas } = fixture();
  try {
    const git = makeGit(work);
    assert.deepEqual(shelfPacks(git, 'HEAD'), ['alpha', 'beta']);
    assert.deepEqual(bumpCommits(git, 'HEAD', 'alpha'), [{ sha: shas.seed, version: '60901.1', date: '2026-09-01' }]);
    assert.deepEqual(bumpCommits(git, 'HEAD', 'beta'), [
      { sha: shas.betaSelf, version: '60902.1', date: '2026-09-02' },
      { sha: shas.seed, version: '60901.1', date: '2026-09-01' },
    ]);
  } finally { removeTree(dir); }
});

test('planBumps: a pack with shipping content since its last bump takes today\'s next version; a test-only change and a self-bumped pack take nothing', () => {
  const { dir, work } = fixture();
  try {
    const plan = planBumps(makeGit(work), 'HEAD', { today: TODAY });
    assert.deepEqual(plan.map((b) => [b.id, b.from, b.to, b.changed]), [
      ['alpha', '60901.1', '60905.1', ['packs/alpha/RULES.md']],
    ]);
    assert.equal(declaredPackVersion(plan[0].text), '60905.1');
  } finally { removeTree(dir); }
});

test('planBumps refuses to lower a version the clock cannot reach', () => {
  const { dir, work } = fixture();
  try {
    land(work, 'Alpha from the future (#13)', { 'packs/alpha/pack.mjs': manifest('61001.1'), 'packs/alpha/RULES.md': '# alpha 2\n' });
    land(work, 'More alpha (#14)', { 'packs/alpha/RULES.md': '# alpha 3\n' });
    assert.throws(() => planBumps(makeGit(work), 'HEAD', { today: TODAY }), /61001\.1, above the next version today would cut \(60905\.1\)/);
  } finally { removeTree(dir); }
});

test('run: cuts the versions onto the base branch from a checkout parked elsewhere, stamps the task, and a second pass bumps nothing', async () => {
  const { dir, origin, work } = fixture();
  try {
    // The checkout is mid-work on another task's branch with a dirty tree — the state
    // one executor run hands the next item.
    sh(work, 'checkout', '--quiet', '-b', 'another-tasks-branch');
    writeFileSync(join(work, 'dirty.txt'), 'uncommitted\n');
    const head = sh(work, 'rev-parse', 'HEAD').trim();
    const said = [];

    const first = await run({ root: work, remote: origin, base: 'main', today: TODAY, log: (s) => said.push(s) });
    assert.deepEqual(first.bumped, [{ id: 'alpha', from: '60901.1', to: '60905.1' }]);

    // Origin's main is the old tip plus exactly the manifest, under the task's trailer.
    const tip = sh(work, 'ls-remote', '--heads', origin, 'main').split('\t')[0];
    assert.equal(tip, first.commit);
    assert.equal(sh(work, 'rev-parse', `${tip}^`).trim(), sh(work, 'rev-parse', 'main').trim());
    assert.equal(sh(work, 'diff', '--name-only', `${tip}^`, tip).trim(), 'packs/alpha/pack.mjs');
    assert.equal(declaredPackVersion(sh(work, 'show', `${tip}:packs/alpha/pack.mjs`)), '60905.1');
    assert.equal(declaredPackVersion(sh(work, 'show', `${tip}:packs/beta/pack.mjs`)), '60902.1');
    const message = sh(work, 'log', '-1', '--format=%B', tip);
    assert.match(message, /^Bump pack versions: alpha 60905\.1$/m);
    assert.match(message, new RegExp(`^Claudinite-Task: ${BUMP_TASK}$`, 'm'));

    // The checkout never moved.
    assert.equal(sh(work, 'rev-parse', 'HEAD').trim(), head);
    assert.equal(sh(work, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'another-tasks-branch');
    assert.equal(readFileSync(join(work, 'dirty.txt'), 'utf8'), 'uncommitted\n');
    assert.equal(readFileSync(join(work, 'packs/alpha/pack.mjs'), 'utf8'), manifest('60901.1'));

    // Idempotent: the bump commit is not content, so the second pass finds nothing.
    const second = await run({ root: work, remote: origin, base: 'main', today: TODAY, log: (s) => said.push(s) });
    assert.deepEqual(second, { bumped: [], commit: null });
    assert.ok(said.some((s) => /nothing to bump/.test(s)), said.join('\n'));

    // A same-day change after the bump takes the day's next number.
    sh(work, 'checkout', '--quiet', 'main');
    sh(work, 'pull', '--quiet', 'origin', 'main');
    land(work, 'Alpha again (#20)', { 'packs/alpha/RULES.md': '# alpha\n\n- two rules\n' }, { date: '2026-09-05T16:00:00Z' });
    const third = await run({ root: work, remote: origin, base: 'main', today: TODAY, log: quiet });
    assert.deepEqual(third.bumped, [{ id: 'alpha', from: '60905.1', to: '60905.2' }]);
  } finally { removeTree(dir); }
});

test('a push the branch moved under is refused, never forced, and run replans from the new tip', async () => {
  const { dir, origin, work } = fixture();
  try {
    const git = makeGit(work);
    const before = sh(work, 'rev-parse', 'HEAD').trim();
    const rejected = pushOnto(git, {
      remote: origin, baseSha: sh(work, 'rev-parse', 'HEAD~1').trim(), branch: 'main',
      files: { 'packs/alpha/pack.mjs': manifest('60905.1') }, message: 'stale',
    });
    assert.equal(rejected, null);
    assert.equal(sh(work, 'ls-remote', '--heads', origin, 'main').split('\t')[0], before);

    // Main moves between the plan and the push: beta lands mid-bump. The first push is
    // refused; the replan reads the moved tip, and both packs are cut on it.
    let moved = false;
    const racing = (args, opts) => {
      const out = git(args, opts);
      if (!moved && args.includes('commit-tree')) {
        moved = true;
        land(work, 'Beta lands mid-bump (#30)', { 'packs/beta/RULES.md': '# beta\n\n- more\n' }, { date: '2026-09-05T14:00:00Z' });
      }
      return out;
    };
    const said = [];
    const result = await run({ root: work, remote: origin, base: 'main', today: TODAY, log: (s) => said.push(s), git: racing });
    assert.deepEqual(result.bumped, [
      { id: 'alpha', from: '60901.1', to: '60905.1' },
      { id: 'beta', from: '60902.1', to: '60905.1' },
    ]);
    assert.ok(said.some((s) => /moved under the push \(attempt 1 of 3\)/.test(s)), said.join('\n'));
    const tip = sh(work, 'ls-remote', '--heads', origin, 'main').split('\t')[0];
    assert.equal(sh(work, 'log', '-1', '--format=%s', `${tip}^`).trim(), 'Beta lands mid-bump (#30)');
  } finally { removeTree(dir); }
});

test('versionHistory attributes each version the pull requests landed since the previous bump, minus tests and the bump commits', async () => {
  const { dir, origin, work } = fixture();
  try {
    await run({ root: work, remote: origin, base: 'main', today: TODAY, log: quiet, git: gitAtToday(work) });
    sh(work, 'pull', '--quiet', 'origin', 'main');
    const git = makeGit(work);
    const alpha = versionHistory(git, 'HEAD', 'alpha');
    assert.deepEqual(alpha.map((v) => [v.version, v.date, v.commits.map((c) => [c.subject, c.pr])]), [
      ['60901.1', '2026-09-01', [['Seed the shelf (#1)', 1]]],
      ['60905.1', '2026-09-05', [['Teach alpha a rule (#10)', 10]]],
    ]);
    const beta = versionHistory(git, 'HEAD', 'beta');
    assert.deepEqual(beta.map((v) => [v.version, v.commits.map((c) => c.pr)]), [
      ['60901.1', [1]],
      ['60902.1', [12]],
    ]);
  } finally { removeTree(dir); }
});

test('renderHistory adds only the rows a record lacks, keeps hand-written rows verbatim, and orders newest first', () => {
  const existing = [
    '# Version history', '', 'Some hand-written preamble.', '',
    '| Version | Date | What changed |', '|---|---|---|',
    '| 60902.1 | 2026-09-02 | A row a person wrote, with a pipe \\| in it. |',
    '',
  ].join('\n');
  const history = [
    { version: '60901.1', date: '2026-09-01', commits: [{ subject: 'Seed (#1)', pr: 1 }] },
    { version: '60902.1', date: '2026-09-02', commits: [{ subject: 'Replaced? (#2)', pr: 2 }] },
    { version: '60905.1', date: '2026-09-05', commits: [{ subject: 'One (#3)', pr: 3 }, { subject: 'Two | piped (#4)', pr: 4 }] },
    { version: '60905.2', date: '2026-09-05', commits: [] },
  ];
  const text = renderHistory('alpha', existing, history);
  assert.deepEqual(rowVersions(text).map((r) => r.version), ['60905.2', '60905.1', '60902.1', '60901.1']);
  assert.match(text, /^\| 60902\.1 \| 2026-09-02 \| A row a person wrote, with a pipe \\\| in it\. \|$/m);
  assert.match(text, /^\| 60905\.1 \| 2026-09-05 \| One \(#3\); Two \\\| piped \(#4\) \|$/m);
  assert.match(text, /^\| 60905\.2 \| 2026-09-05 \| _no pull request is attributed to this version_ \|$/m);
  assert.doesNotMatch(text, /hand-written preamble/);
  assert.match(text, /^Records for `packs\/alpha\/pack\.mjs`'s `version` field/m);
  // Stable: rendering the rendered text adds nothing.
  assert.equal(renderHistory('alpha', text, history), text);
  assert.equal(pullNumber('No number here'), null);
});

test('planHistory returns only the records that would change, and nothing once they have landed', async () => {
  const { dir, origin, work } = fixture();
  try {
    await run({ root: work, remote: origin, base: 'main', today: TODAY, log: quiet, git: gitAtToday(work) });
    sh(work, 'pull', '--quiet', 'origin', 'main');
    const git = makeGit(work);
    const files = planHistory(git, 'HEAD');
    assert.deepEqual(Object.keys(files).sort(), ['packs/alpha/VERSIONS.md', 'packs/beta/VERSIONS.md']);
    assert.match(files['packs/alpha/VERSIONS.md'], /^\| 60905\.1 \| 2026-09-05 \| Teach alpha a rule \(#10\) \|$/m);
    land(work, 'Record the versions (#40)', files, { date: '2026-09-05T17:00:00Z', trailer: 'claudinite-canon-curation/pack-version-history' });
    assert.deepEqual(planHistory(git, 'HEAD'), {});
    // The record landing is not content: no version moves for it.
    assert.deepEqual(planBumps(git, 'HEAD', { today: TODAY }), []);
  } finally { removeTree(dir); }
});
