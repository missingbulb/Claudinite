import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, deletePath, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import promoteScope from '../promote-scope.mjs';
import { corpusRoots } from '../canon-config.mjs';

function run(root) {
  return promoteScope.run(buildContext({ root, mode: 'changed' }));
}

// A canon declaring a second corpus root beside its shelf, as the pack entry carries it.
const settings = (writePaths) => JSON.stringify({
  packs: [{ id: 'claudinite-canon-curation', ...(writePaths ? { config: { write_paths: writePaths } } : {}) }],
}, null, 2) + '\n';

test('promote-scope: silent when the branch touches only the canon shelf', () => {
  const root = makeRepo({
    changed: { 'packs/node/RULES.md': '- new rule\n' },
    commitMsg: 'promote Refs #1',
  });
  try {
    assert.deepEqual(run(root), []);
  } finally {
    cleanup(root);
  }
});

test('promote-scope: fires on a path outside the corpus roots', () => {
  const root = makeRepo({
    changed: {
      'packs/node/RULES.md': '- new rule\n',
      'engine/pack_loader/pack-registry.mjs': '// edited\n', // stray: engine machinery, off-limits to promote
    },
    commitMsg: 'promote Refs #1',
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'engine/pack_loader/pack-registry.mjs');
    assert.equal(findings[0].rule, 'promote-scope');
  } finally {
    cleanup(root);
  }
});

// The shelf is structural, so a canon whose corpus is only its shelf configures
// nothing; a canon that keeps a second corpus root says so on its pack entry, and
// promote may then land there too. Without that entry the same path is a stray.
test('promote-scope: a second corpus root counts only where the canon declares it', () => {
  const bare = makeRepo({
    base: { '.claudinite-settings.json': settings(null) },
    changed: { 'skills/writing-tests/SKILL.md': 'updated\n' },
    commitMsg: 'promote Refs #1',
  });
  const declared = makeRepo({
    base: { '.claudinite-settings.json': settings(['skills']) },
    changed: { 'skills/writing-tests/SKILL.md': 'updated\n' },
    commitMsg: 'promote Refs #1',
  });
  try {
    assert.deepEqual(run(bare).map((f) => f.file), ['skills/writing-tests/SKILL.md']);
    assert.deepEqual(run(declared), []);
  } finally {
    cleanup(bare); cleanup(declared);
  }
});

// Per-user preferences do not live in a canon at all — they belong to a fleet's
// users, so item-routing sends them to the repo the `preferences` setting names. The
// gate is what stops a promote from quietly re-creating a canon-side home for them.
test('promote-scope: a canon-side per-user preferences path is out of bounds', () => {
  const root = makeRepo({
    changed: { 'preferences/someone@example.com.md': '- pref\n' },
    commitMsg: 'promote Refs #1',
  });
  try {
    const findings = run(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'preferences/someone@example.com.md');
  } finally {
    cleanup(root);
  }
});

test('promote-scope: a deletion outside the corpus roots is caught too', () => {
  const root = makeRepo({
    base: { 'engine/old.md': 'legacy\n' },
    changed: { 'packs/node/RULES.md': '- new rule\n' },
    commitMsg: 'promote Refs #1',
  });
  try {
    deletePath(root, 'engine/old.md', 'prune Refs #1');
    const findings = run(root);
    assert.ok(findings.some((f) => f.file === 'engine/old.md'));
  } finally {
    cleanup(root);
  }
});

// --- canon-config ------------------------------------------------------------
// The shelf is never removable and every root carries its trailing slash, so a
// prefix test cannot match a sibling file whose name merely starts with a root.

test('corpusRoots: the shelf stands alone when nothing is declared', () => {
  assert.deepEqual(corpusRoots(null), ['packs/']);
  assert.deepEqual(corpusRoots('not json'), ['packs/']);
  assert.deepEqual(corpusRoots(settings(null)), ['packs/']);
});

test('corpusRoots: a declared root joins the shelf, normalized and deduped', () => {
  assert.deepEqual(corpusRoots(settings(['./skills/', 'packs', 'prompts'])), ['packs/', 'skills/', 'prompts/']);
  assert.deepEqual(corpusRoots(settings('skills')), ['packs/']);   // not a list — the default stands
  assert.deepEqual(corpusRoots(settings(['  '])), ['packs/']);
});
