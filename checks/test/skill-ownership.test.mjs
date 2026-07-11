import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from './helpers.mjs';
import { buildContext } from '../lib/context.mjs';
import skillOwnership from '../../packs/basics/skill-ownership.mjs';

// The relevance gate: both registries tracked = the repo IS the corpus.
const CORPUS_MARKERS = {
  'packs/registry.mjs': '// corpus marker\n',
  'skills/registry.mjs': '// corpus marker\n',
};

function run(root, knownPacks) {
  const ctx = buildContext({ root, mode: 'all' });
  ctx.knownPacks = knownPacks; // attached by the runner in real sweeps
  return skillOwnership.run(ctx);
}

test('skill-ownership: flags a skill no pack requires', () => {
  const root = makeRepo({
    changed: { ...CORPUS_MARKERS, 'skills/orphan/SKILL.md': '---\nname: orphan\n---\nbody\n' },
  });
  try {
    const findings = run(root, [{ id: 'basics', skills: [] }]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'skills/orphan/SKILL.md');
    assert.match(findings[0].what, /no pack requires/);
  } finally { cleanup(root); }
});

test('skill-ownership: passes when at least one pack requires the skill', () => {
  const root = makeRepo({
    changed: { ...CORPUS_MARKERS, 'skills/orphan/SKILL.md': '---\nname: orphan\n---\nbody\n' },
  });
  try {
    assert.equal(run(root, [{ id: 'basics', skills: ['orphan'] }]).length, 0);
    // Required by several packs is fine too.
    assert.equal(run(root, [
      { id: 'basics', skills: ['orphan'] },
      { id: 'node', skills: ['orphan'] },
    ]).length, 0);
  } finally { cleanup(root); }
});

test('skill-ownership: flags a pack requiring a skill that does not exist', () => {
  const root = makeRepo({ changed: { ...CORPUS_MARKERS } });
  try {
    const findings = run(root, [{ id: 'node', skills: ['ghost'] }]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'packs/node/pack.mjs');
    assert.match(findings[0].what, /"ghost"/);
  } finally { cleanup(root); }
});

test('skill-ownership: silent outside the corpus repo', () => {
  // A consumer never tracks the registries (the corpus lives under its
  // gitignored mount) — the rule must not fire there.
  const root = makeRepo({
    changed: { 'skills/orphan/SKILL.md': '---\nname: orphan\n---\nbody\n' },
  });
  try {
    assert.equal(run(root, [{ id: 'basics', skills: [] }]).length, 0);
  } finally { cleanup(root); }
});
