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
  const bad = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n' } });
  const good = makeRepo({ changed: { 'doc.md': '[ok](README.md)\n' } });
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
    changed: { 'a.js': '// eslint-disable-next-line no-undef\ny();\n' },
  });
  try {
    const r = runCli(root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /warning-suppression/);
  } finally { cleanup(root); }
});

test('an acceptance with a reason silences its finding; without a reason it is itself a finding', () => {
  const accepted = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        accept: [{ rule: 'reference-integrity', path: 'doc.md', reason: 'target lands in the next PR' }],
      }),
    },
  });
  const reasonless = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
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
      '.claudinite-checks.json': JSON.stringify({ rules: { 'reference-integrity': 'advisory' } }),
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

test('--init writes the pack declaration once and is idempotent', () => {
  const root = makeRepo({ changed: {} });
  try {
    assert.equal(runCli(root, '--init').status, 0);
    assert.ok(existsSync(join(root, '.claudinite-checks.json')));
    const first = readFileSync(join(root, '.claudinite-checks.json'), 'utf8');
    assert.deepEqual(JSON.parse(first).packs, []);
    assert.equal(runCli(root, '--init').status, 0);
    assert.equal(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'), first);
  } finally { cleanup(root); }
});
