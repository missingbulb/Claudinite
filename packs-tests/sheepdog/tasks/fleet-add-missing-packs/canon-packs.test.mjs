import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCanonPacks } from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/canon-packs.mjs';

// The corpus loader guards ONE silent failure, and it is the worst one this task
// could have: sweeping the fleet against a pack corpus that is nearly empty. Every
// member then comes back "fitted" and the report looks like good news. So the tests
// below are all about refusing to return a corpus that would produce a clean lie.

const canonRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

// A local repo standing in for canon, served over a file:// origin — so the real
// clone path runs, with no network and no credential.
const REPO = 'acme/Claudinite';
function fakeCanon({ full = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fit-canon-src-'));
  const dir = join(root, `${REPO}.git`);
  mkdirSync(dir, { recursive: true });
  if (full) {
    for (const sub of ['engine', 'packs']) cpSync(join(canonRoot, sub), join(dir, sub), { recursive: true });
  } else {
    // Real packs, just too few of them — so the size guard is what fires, not
    // manifest validation on a hand-rolled stub.
    cpSync(join(canonRoot, 'engine'), join(dir, 'engine'), { recursive: true });
    for (const id of ['basics', 'node', 'python']) {
      cpSync(join(canonRoot, 'packs', id), join(dir, 'packs', id), { recursive: true });
    }
  }
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('add', '-A');
  git('commit', '-qm', 'canon');
  return { origin: `file://${root}`, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('loadCanonPacks: returns the WHOLE canon corpus, not the caller\'s mount', async (t) => {
  const canon = fakeCanon();
  t.after(canon.cleanup);
  const { packs, dispose } = await loadCanonPacks({ canonRepo: REPO, token: 'unused', origin: canon.origin });
  t.after(dispose);
  // The number that matters is "many", not an exact count that would churn with the
  // corpus: a mount-scoped load would return a handful.
  assert.ok(packs.length >= 20, `expected the full corpus, got ${packs.length}`);
  const ids = new Set(packs.map((p) => p.id));
  for (const id of ['node', 'python', 'firebase', 'jwt']) assert.ok(ids.has(id), `missing ${id}`);
  // And the fingerprints came with them — a corpus of manifests with no `detect` would
  // sweep the fleet and find nothing, by construction.
  assert.ok(packs.filter((p) => typeof p.detect === 'function').length >= 10);
});

test('loadCanonPacks: refuses a corpus too small to be canon', async (t) => {
  // The failure mode in one line: one pack loaded, every member reported fitted.
  const canon = fakeCanon({ full: false });
  t.after(canon.cleanup);
  await assert.rejects(
    () => loadCanonPacks({ canonRepo: REPO, token: 'unused', origin: canon.origin }),
    /refusing to sweep the fleet against a corpus that small/,
  );
});

test('loadCanonPacks: a repo that is not a canon is an error, not an empty corpus', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'fit-notcanon-'));
  const dir = join(root, `${REPO}.git`);
  mkdirSync(dir, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  writeFileSync(join(dir, 'README.md'), '# not a canon\n');
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  git('add', '-A'); git('commit', '-qm', 'x');
  await assert.rejects(
    () => loadCanonPacks({ canonRepo: REPO, token: 'unused', origin: `file://${root}` }),
    /not a Claudinite canon/,
  );
});

test('loadCanonPacks: a clone failure never leaks the token into the message', async () => {
  // The token is embedded in the clone URL, so git's own error text carries it — and
  // that text goes to a run summary and, on failure, into a needs-human issue.
  const token = 'ghp_supersecretvalue';
  await assert.rejects(
    () => loadCanonPacks({ canonRepo: 'no-such-owner/no-such-repo-xyz', token }),
    (e) => {
      assert.ok(!e.message.includes(token), `token leaked: ${e.message}`);
      return /cloning canon/.test(e.message);
    },
  );
});

test('loadCanonPacks: a malformed canonRepo fails before it tries to clone anything', async () => {
  await assert.rejects(
    () => loadCanonPacks({ canonRepo: 'not-an-owner-repo', token: 'x' }),
    /is not an owner\/repo/,
  );
});
