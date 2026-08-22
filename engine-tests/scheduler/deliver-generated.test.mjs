import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseTip, readAt, pushGenerated } from '../../engine/scheduler/deliver-generated.mjs';
import { removeTree } from '../../engine/remove-tree.mjs';

// The PR half needs GitHub; the GIT half is where the risk lives and it is fully
// testable against a local bare origin. What is being pinned: a task can commit a
// generated file onto the base branch WITHOUT disturbing the checkout it shares with
// every other task in the same scheduler run.

function sh(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-deliver-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  mkdirSync(origin); mkdirSync(work);
  sh(origin, 'init', '--bare', '--quiet', '--initial-branch=main');
  sh(work, 'init', '--quiet', '--initial-branch=main');
  sh(work, 'config', 'user.email', 't@t');
  sh(work, 'config', 'user.name', 't');
  sh(work, 'remote', 'add', 'origin', origin);
  writeFileSync(join(work, 'README.md'), '# repo\n');
  sh(work, 'add', '-A');
  sh(work, 'commit', '--quiet', '-m', 'base');
  sh(work, 'push', '--quiet', 'origin', 'main');
  return { dir, origin, work };
}

test('pushGenerated commits onto the base tip and leaves the checkout untouched', () => {
  const { dir, origin, work } = fixture();
  try {
    // The checkout is mid-work on someone else's branch with a dirty tree — exactly
    // the state the scheduler hands the next task in a run.
    sh(work, 'checkout', '--quiet', '-b', 'another-tasks-branch');
    writeFileSync(join(work, 'scratch.txt'), 'someone else is working here\n');
    sh(work, 'add', '-A');
    sh(work, 'commit', '--quiet', '-m', 'another task');
    writeFileSync(join(work, 'dirty.txt'), 'uncommitted\n');

    const head = sh(work, 'rev-parse', 'HEAD').trim();
    const status = sh(work, 'status', '--porcelain');

    pushGenerated(work, {
      remote: origin,
      baseSha: baseTip(work, origin, 'main'),
      branch: 'claudinite/generated/2026-07-28',
      files: { 'out/thing.GENERATED.json': '{"a":1}\n', '.gitattributes': 'thing.GENERATED.json merge=ours\n' },
      message: 'Claudinite: regenerate',
    });

    // The pushed branch is the BASE plus exactly those files — no trace of the other
    // task's commit, which would otherwise ride along into an auto-merging PR.
    const pushed = sh(origin, 'ls-tree', '--name-only', '-r', 'claudinite/generated/2026-07-28').trim().split('\n').sort();
    assert.deepEqual(pushed, ['.gitattributes', 'README.md', 'out/thing.GENERATED.json']);
    assert.equal(sh(origin, 'show', 'claudinite/generated/2026-07-28:out/thing.GENERATED.json'), '{"a":1}\n');
    assert.equal(sh(origin, 'rev-list', '--count', 'claudinite/generated/2026-07-28').trim(), '2', 'one commit on top of the base');

    // And the checkout is exactly as it was found.
    assert.equal(sh(work, 'rev-parse', 'HEAD').trim(), head, 'HEAD never moved');
    assert.equal(sh(work, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'another-tasks-branch');
    assert.equal(sh(work, 'status', '--porcelain'), status, 'the index and working tree are untouched');
    assert.ok(existsSync(join(work, 'dirty.txt')), 'the other task\'s uncommitted work survives');
    assert.ok(!existsSync(join(work, 'out')), 'the generated file was never written to disk at all');
  } finally { removeTree(dir); }
});

test('a second run regenerates the branch from the base rather than stacking on itself', () => {
  const { dir, origin, work } = fixture();
  try {
    const push = (content) => pushGenerated(work, {
      remote: origin, baseSha: baseTip(work, origin, 'main'), branch: 'gen/x',
      files: { 'v.GENERATED.json': content }, message: 'regenerate',
    });
    push('{"n":1}\n');
    push('{"n":2}\n');
    assert.equal(sh(origin, 'show', 'gen/x:v.GENERATED.json'), '{"n":2}\n');
    assert.equal(sh(origin, 'rev-list', '--count', 'gen/x').trim(), '2',
      'still one commit on the base — a regenerate replaces, it does not accumulate');
  } finally { removeTree(dir); }
});

test('readAt returns a file at the base, and null for one that is not there yet', () => {
  const { dir, origin, work } = fixture();
  try {
    const sha = baseTip(work, origin, 'main');
    assert.equal(readAt(work, sha, 'README.md'), '# repo\n');
    assert.equal(readAt(work, sha, 'out/thing.GENERATED.json'), null, 'the first run has no prior state');
  } finally { removeTree(dir); }
});

test('the throwaway index is cleaned up even when the push fails', () => {
  const { dir, work } = fixture();
  try {
    const before = readFileSync(join(work, '.git/index'));
    assert.throws(() => pushGenerated(work, {
      remote: join(dir, 'nowhere.git'), // no such remote — the push throws
      baseSha: sh(work, 'rev-parse', 'HEAD').trim(),
      branch: 'gen/x', files: { 'a.txt': 'x\n' }, message: 'm',
    }));
    assert.deepEqual(readFileSync(join(work, '.git/index')), before, "the repo's real index was never the one written");
  } finally { removeTree(dir); }
});
