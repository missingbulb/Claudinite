import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashedCron } from './engine/scheduler/hash-minute.mjs';
import { packIdForRepo } from './engine/scheduler/converge-wiring.mjs';

// Integration suite for bootstrap.mjs, THE one-shot adoption orchestrator: it runs
// the real canon (this checkout) against a fresh fixture repo, because the whole
// point of the script is that a fresh adoption needs nothing but this invocation —
// a hermetic mini-canon would prove the plumbing while missing exactly the
// cross-module wiring (vendor set → converge-wiring → sweeps) the script exists
// to sequence.
const CANON = dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP = join(CANON, 'bootstrap.mjs');
const REPO = 'acme/WidgetWorks';
const LOCAL_PACK_ID = packIdForRepo(REPO);

const run = (root, ...args) => execFileSync(process.execPath, [BOOTSTRAP, '--target', root, '--repo', REPO, ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// A fresh consumer: a git repo with one committed README and nothing else —
// the state bootstrap.md's Part 1 meets.
function freshRepo() {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-bootstrap-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  writeFileSync(join(root, 'README.md'), '# WidgetWorks\n\nA fixture.\n');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  return root;
}

const json = (root) => JSON.parse(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'));
const at = (root, rel) => readFileSync(join(root, rel), 'utf8');

test('bootstrap converges a fresh repo in one invocation', () => {
  const root = freshRepo();
  const out = run(root, '--packs', 'product-wiki', '--answer', 'product-wiki/product=A widget catalog app');

  // Declaration: seeded defaults plus the requested pack, its answer recorded,
  // the scheduler anchors, and the vendor stamp.
  const decl = json(root);
  const ids = decl.packs.map((p) => (typeof p === 'string' ? p : p.id));
  assert.ok(ids.includes('basics'), `basics seeded (got ${ids.join(', ')})`);
  assert.ok(ids.includes('product-wiki'), 'requested pack declared');
  const wiki = decl.packs.find((p) => p?.id === 'product-wiki');
  assert.equal(wiki.answers.product, 'A widget catalog app');
  assert.deepEqual(decl.taskScheduler, { dailyHour: 4, weeklyDay: 'Sun', monthlyDay: 1 });
  assert.equal(decl.maintenance.delivery, 'auto-merge');
  assert.ok(decl.claudinite.engineVersion, 'stamped');
  assert.ok(decl.claudinite.packVersions['product-wiki'], 'requested pack stamped');

  // The mount.
  assert.ok(existsSync(join(root, '.claudinite/shared/engine/checks/check_the_world.mjs')));
  assert.ok(existsSync(join(root, '.claudinite/shared/packs/product-wiki/RULES.md')));

  // The wiring: hooks, ignore lines, both workflows (scheduler at the repo's
  // hashed minute), the rules index and its CLAUDE.md import, the seeded local
  // pack, the README badge row.
  const settings = at(root, '.claude/settings.json');
  for (const hook of ['session-start-command.sh', 'stop-command.mjs', 'pretooluse-command.mjs', 'session-end-command.mjs']) {
    assert.ok(settings.includes(hook), `${hook} registered`);
  }
  const ignore = at(root, '.gitignore');
  assert.ok(ignore.includes('/.claudinite-hooks.log\n') && ignore.includes('/.claudinite-hooks.log.tmp'));
  assert.ok(at(root, '.github/workflows/claudinite-scheduler.yml').includes(`cron: '${hashedCron(REPO)}'`));
  assert.ok(existsSync(join(root, '.github/workflows/claudinite-executor.yml')));
  assert.ok(existsSync(join(root, '.claudinite/claudinite-rules.GENERATED.md')));
  assert.ok(at(root, 'CLAUDE.md').includes('claudinite-rules.GENERATED.md'));
  assert.ok(existsSync(join(root, `.claudinite/local/packs/${LOCAL_PACK_ID}/pack.mjs`)));
  assert.ok(at(root, 'README.md').includes('<!-- claudinite:packs -->'));

  // A repo with no CI gets the minimal sweeps workflow.
  const ci = at(root, '.github/workflows/claudinite-ci.yml');
  assert.ok(ci.includes('check_the_world.mjs') && ci.includes('ci-work-scope.mjs'));

  // The report: answered questions are settled, unanswered ones surface once,
  // batched for a single interview pass — never one popup per pack.
  assert.ok(!/PENDING.*\n(.|\n)*product-wiki\/product:/.test(out), 'answered question not re-asked');
  assert.ok(out.includes('product-wiki/users'), 'unanswered question listed');
  assert.ok(out.includes('product-wiki/market'), 'unanswered question listed');
  assert.ok(/selftest: ok/.test(out), `selftest ran green in:\n${out}`);
});

test('bootstrap re-run is idempotent and records late answers', () => {
  const root = freshRepo();
  run(root, '--packs', 'product-wiki');

  const before = json(root);
  const out = run(root, '--answer', 'product-wiki/users=Widget shoppers');
  const after = json(root);

  const wiki = after.packs.find((p) => p?.id === 'product-wiki');
  assert.equal(wiki.answers.users, 'Widget shoppers');
  // Nothing but the new answer (which upgrades the string entry to an object)
  // and the refreshed stamp moves.
  before.packs = before.packs.map((p) => (p === 'product-wiki' || p?.id === 'product-wiki' ? wiki : p));
  before.claudinite = after.claudinite;
  assert.deepEqual(after, before);
  assert.ok(/wiring: already converged/.test(out), `second run reports converged:\n${out}`);
});

test('bootstrap refuses an answer that names no question', () => {
  const root = freshRepo();
  assert.throws(
    () => run(root, '--packs', 'product-wiki', '--answer', 'product-wiki/nope=x'),
    (e) => e.status === 1 && /nope/.test(`${e.stdout}${e.stderr}`),
  );
});
