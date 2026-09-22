import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { runRule as dispatch } from '../../../../../engine/checks/helpers/work.mjs';
import checks from '../../../skills/adopt-pack/checks.mjs';

const rule = checks[0];

// A pack that asks two questions, standing in for acme-pack-e / acme-pack-r.
const asking = (over = {}) => ({
  id: 'asker',
  questions: [
    { id: 'product', prompt: 'P?', distill: 'd1' },
    { id: 'market', prompt: 'M?', distill: 'd2' },
  ],
  ...over,
});
const decl = (ids) => `${JSON.stringify({ packs: ids }, null, 2)}\n`;

// Build a feature branch whose declaration went from `base` ids to `head` ids,
// then run the rule with the discovered packs and normalized config injected
// (the runner attaches these in production; a unit dispatch supplies them).
function run({ base, head, entries, packs }) {
  const root = makeRepo({
    base: { '.claudinite-settings.json': decl(base) },
    changed: { '.claudinite-settings.json': decl(head) },
  });
  try {
    const ctx = buildContext({ root, mode: 'all', baseOverride: 'main' });
    ctx.packs = packs;
    ctx.config = { packs: entries.map((e) => e.id), packEntries: entries, packConfig: {}, rules: {} };
    return dispatch(rule, ctx);
  } finally { cleanup(root); }
}

test('a pack newly declared with no answers yields one finding per unanswered question', () => {
  const f = run({
    base: ['acme-pack'],
    head: ['acme-pack', 'asker'],
    entries: [{ id: 'acme-pack' }, { id: 'asker' }],
    packs: [asking()],
  });
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => x.file === '.claudinite-settings.json' && x.severity === 'blocking'));
  assert.deepEqual(f.map((x) => x.what.match(/asks "(\w+)"/)[1]).sort(), ['market', 'product']);
});

test('a newly declared pack with every answer recorded is clean', () => {
  const f = run({
    base: ['acme-pack'],
    head: ['acme-pack', 'asker'],
    entries: [{ id: 'acme-pack' }, { id: 'asker', answers: { product: 'x', market: 'y' } }],
    packs: [asking()],
  });
  assert.deepEqual(f, []);
});

test('a pack already in the base is never re-litigated, even unanswered', () => {
  const f = run({
    base: ['asker'],
    head: ['asker', 'acme-pack-g'], // this branch adds acme-pack-g (no questions), not asker
    entries: [{ id: 'asker' }, { id: 'acme-pack-g' }],
    packs: [asking(), { id: 'acme-pack-g' }],
  });
  assert.deepEqual(f, []);
});

test('a via-materialized dependency the project did not choose asks nothing', () => {
  const f = run({
    base: ['acme-pack'],
    head: ['acme-pack', 'asker'],
    entries: [{ id: 'acme-pack' }, { id: 'asker', via: ['other'] }],
    packs: [asking()],
  });
  assert.deepEqual(f, []);
});
