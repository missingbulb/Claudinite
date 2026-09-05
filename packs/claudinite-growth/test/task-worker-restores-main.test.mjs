import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import rule from '../worldRules/task-worker-restores-main.mjs';

const DIR = '.claudinite/local/packs/mypack/tasks/refresh-data/';
const WORKER = `${DIR}worker.sh`;

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('task-worker-restores-main: a worker that checks out main before writing is clean', () => {
  const src = '#!/bin/sh\nset -eu\ngit checkout main\n# ... regenerate data ...\ngit commit -am "refresh"\ngit push origin main\n';
  assert.deepEqual(run({ [WORKER]: src }), []);
});

test('task-worker-restores-main: a read-only worker is clean regardless of branch handling', () => {
  const src = '#!/bin/sh\nset -eu\ncurl -o data.json https://example.com/data.json\n';
  assert.deepEqual(run({ [WORKER]: src }), []);
});

test('task-worker-restores-main: a worker that pushes with no restore at all is flagged', () => {
  const src = '#!/bin/sh\nset -eu\ngit commit -am "refresh"\ngit push origin HEAD:main\n';
  const f = run({ [WORKER]: src });
  assert.equal(f.length, 1);
  assert.equal(f[0].file, WORKER);
  assert.match(f[0].what, /without ever returning the checkout to `main`/);
});

test('task-worker-restores-main: a restore that comes after the write is flagged', () => {
  const src = '#!/bin/sh\nset -eu\ngit commit -am "refresh"\ngit push origin HEAD:main\ngit checkout main\n';
  const f = run({ [WORKER]: src });
  assert.equal(f.length, 1);
  assert.match(f[0].what, /only after it has already committed or pushed/);
});

test('task-worker-restores-main: `git switch main` counts as a restore', () => {
  const src = '#!/bin/sh\nset -eu\ngit switch main\ngit commit -am "refresh"\ngit push origin main\n';
  assert.deepEqual(run({ [WORKER]: src }), []);
});

test('task-worker-restores-main: is inert on a non-worker file, and on the legacy local_packs path', () => {
  assert.deepEqual(run({ 'scripts/deploy.sh': 'git commit -am x\ngit push origin HEAD:main\n' }), []);
  const legacy = '.claudinite/local_packs/mypack/tasks/refresh-data/worker.sh';
  const src = '#!/bin/sh\ngit commit -am x\ngit push origin HEAD:main\n';
  assert.equal(run({ [legacy]: src }).length, 1);
});
