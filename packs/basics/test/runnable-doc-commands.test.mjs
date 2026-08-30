import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import runnableDocCommands from '../worldRules/runnable-doc-commands.mjs';

const run = (root) => runnableDocCommands.run(buildContext({ root, mode: 'all' }));
const CANON = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('runnable-doc-commands: a placeholder-rooted command whose suffix names no file is caught', () => {
  const root = makeRepo({ changed: {
    'packs/demo/handler.mjs': 'export default 1;\n',
    'packs/demo/runbook.md': 'Run `node <engine>/scheduler/handler.mjs <scope>` first.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'packs/demo/runbook.md');
    assert.match(findings[0].what, /no file in this repo ends with `scheduler\/handler\.mjs`/);
  } finally { cleanup(root); }
});

test('runnable-doc-commands: a placeholder is judged by its suffix, whatever the placeholder means', () => {
  const root = makeRepo({ changed: {
    'packs/demo/sub/handler.mjs': 'export default 1;\n',
    'packs/demo/runbook.md': 'Run `node <anything>/sub/handler.mjs`.\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

test('runnable-doc-commands: a mount path is resolved against the canon tree beneath it', () => {
  const root = makeRepo({ changed: {
    'packs/demo/handler.mjs': 'export default 1;\n',
    'packs/demo/ok.md': 'Run `node .claudinite/shared/packs/demo/handler.mjs`.\n',
    'packs/demo/stale.md': 'Run `node .claudinite/shared/packs/demo/moved.mjs`.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'packs/demo/stale.md');
    assert.match(findings[0].what, /the mount does not carry/);
  } finally { cleanup(root); }
});

// A pack's prose describes the CONSUMING repo as often as it describes itself, and
// that repo's tree is not ours to assert over.
test('runnable-doc-commands: a consuming repo\'s own path and a bare filename are left alone', () => {
  const root = makeRepo({ changed: {
    'packs/demo/runbook.md': 'Run `node tools/build.mjs`, then `node worker.mjs` from the task directory.\n',
  } });
  try {
    assert.deepEqual(run(root), []);
  } finally { cleanup(root); }
});

// The vendored copy is canon output; its owner may never edit it, so a finding
// there is one nobody can act on.
test('runnable-doc-commands: the vendored mount is not scanned', () => {
  const root = makeRepo({ changed: {
    '.claudinite/shared/packs/demo/runbook.md': 'Run `node <engine>/gone/handler.mjs`.\n',
    '.claudinite/local/packs/mine/runbook.md': 'Run `node <engine>/gone/handler.mjs`.\n',
  } });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, '.claudinite/local/packs/mine/runbook.md');
  } finally { cleanup(root); }
});

// A fixture spelling the rule back at itself proves only the matching. The corpus
// is the tree this rule exists to keep honest, and it is the one that can disagree.
test('runnable-doc-commands: the canon\'s own pack docs are clean', () => {
  assert.deepEqual(run(CANON).map((f) => `${f.file}: ${f.what}`), []);
});
