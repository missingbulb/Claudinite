import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from './helpers.mjs';

const RUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'run.mjs');

function runCli(root, ...args) {
  return spawnSync(process.execPath, [RUN, ...args], { cwd: root, encoding: 'utf8' });
}

test('exit 1 with a rendered finding on a blocking violation; exit 0 when clean', () => {
  const universal = { '.claudinite-checks.json': JSON.stringify({ packs: ['universal'] }) };
  const bad = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n', ...universal } });
  const good = makeRepo({ changed: { 'doc.md': '[ok](README.md)\n', ...universal } });
  try {
    const r = runCli(bad);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /reference-integrity/);
    assert.match(r.stdout, /missing\.md/);
    assert.match(r.stdout, /Fix:/);
    assert.equal(runCli(good).status, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('advisory findings alone do not fail the run', () => {
  const root = makeRepo({
    base: {
      'deep/far/util.mjs': 'export const x = 1;\n',
      '.claudinite-checks.json': JSON.stringify({ packs: ['universal'] }),
    },
    changed: { 'src/mod.mjs': "import { x } from '../deep/far/util.mjs';\nexport { x };\n" },
  });
  try {
    const r = runCli(root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /file-placement/);
  } finally { cleanup(root); }
});

test('a new suppression marker blocks the run (fail fast)', () => {
  const root = makeRepo({
    changed: {
      'a.js': '// eslint-disable-next-line no-undef\ny();\n',
      '.claudinite-checks.json': JSON.stringify({ packs: ['universal'] }),
    },
  });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /warning-suppression/);
  } finally { cleanup(root); }
});

test('an acceptance with a reason silences its finding; without a reason it is itself a finding', () => {
  const accepted = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: ['universal'],
        accept: [{ rule: 'reference-integrity', path: 'doc.md', reason: 'target lands in the next PR' }],
      }),
    },
  });
  const reasonless = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: ['universal'],
        accept: [{ rule: 'reference-integrity', path: 'doc.md' }],
      }),
    },
  });
  try {
    assert.equal(runCli(accepted).status, 0);
    const r = runCli(reasonless);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /reason/);
  } finally { cleanup(accepted); cleanup(reasonless); }
});

test('an acceptance path ending in "/" covers the whole subtree', () => {
  const root = makeRepo({
    changed: {
      'docs/a.md': '[gone](missing.md)\n',
      'docs/deep/b.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: ['universal'],
        accept: [{ rule: 'reference-integrity', path: 'docs/', reason: 'targets land in a follow-up PR' }],
      }),
    },
  });
  try {
    assert.equal(runCli(root).status, 0);
  } finally { cleanup(root); }
});

test('severity override in config demotes a blocking rule to advisory', () => {
  const root = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({ packs: ['universal'], rules: { 'reference-integrity': 'advisory' } }),
    },
  });
  try {
    assert.equal(runCli(root).status, 0);
  } finally { cleanup(root); }
});

test('--list emits the machine-readable rule catalog', () => {
  const root = makeRepo({ changed: {} });
  try {
    const r = runCli(root, '--list');
    assert.equal(r.status, 0);
    for (const id of ['reference-integrity', 'markdown-link-labels', 'task-lifecycle',
                      'warning-suppression', 'file-placement', 'pack-declaration',
                      'squash-merge-history']) {
      assert.match(r.stdout, new RegExp(`^${id}\t`, 'm'));
    }
  } finally { cleanup(root); }
});

test('a declared pack runs; an undeclared fingerprinted pack demands declaration', () => {
  const wf = { '.github/workflows/x.yml': 'name: x\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    if: ${{ secrets.T }}\n    steps:\n      - run: echo hi\n' };
  const undeclared = makeRepo({
    changed: { ...wf, '.claudinite-checks.json': JSON.stringify({ packs: ['universal'] }) },
  });
  const declared = makeRepo({
    changed: { ...wf, '.claudinite-checks.json': JSON.stringify({ packs: ['universal', 'github-actions'] }) },
  });
  try {
    const u = runCli(undeclared);
    assert.equal(u.status, 1);
    assert.match(u.stdout, /pack-declaration/);
    assert.doesNotMatch(u.stdout, /gha\//); // pack rules don't run until declared
    const d = runCli(declared);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /gha\/secrets-in-job-if/);
    assert.doesNotMatch(d.stdout, /pack-declaration/);
  } finally { cleanup(undeclared); cleanup(declared); }
});

test('--init writes the pack declaration once and is idempotent', () => {
  const root = makeRepo({ changed: {} });
  try {
    assert.equal(runCli(root, '--init').status, 0);
    assert.ok(existsSync(join(root, '.claudinite-checks.json')));
    const first = readFileSync(join(root, '.claudinite-checks.json'), 'utf8');
    // No pack is active by default, so --init materializes the universal baseline.
    assert.deepEqual(JSON.parse(first).packs, ['universal']);
    // The delivery selection is materialized, never an implicit default.
    assert.equal(JSON.parse(first).maintenance.delivery, 'push');
    assert.equal(runCli(root, '--init').status, 0);
    assert.equal(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'), first);
  } finally { cleanup(root); }
});

test('no pack runs undeclared — universal included', () => {
  // Same blocking violation as above, but nothing declared: the baseline is
  // explicit opt-in, so the run stays silent and green.
  const bare = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n' } });
  const empty = makeRepo({ changed: {
    'doc.md': '[gone](missing.md)\n',
    '.claudinite-checks.json': JSON.stringify({ packs: [] }),
  } });
  try {
    for (const root of [bare, empty]) {
      const r = runCli(root);
      assert.equal(r.status, 0);
      assert.doesNotMatch(r.stdout, /reference-integrity/);
    }
  } finally { cleanup(bare); cleanup(empty); }
});

test('a skill-owned check is discovered and run through the CLI, and listed', () => {
  const root = makeRepo({ changed: {
    'dev/routines/demo/routine.md': 'Run `bash dev/routines/demo/preconditions.sh`.\n',
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1); // routine-structure lives in skills/, not a pack, yet still runs
    assert.match(r.stdout, /routine-structure/);
    assert.match(runCli(root, '--list').stdout, /^routine-structure\t/m);
  } finally { cleanup(root); }
});
