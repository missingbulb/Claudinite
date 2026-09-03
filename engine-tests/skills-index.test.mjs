import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillsIndexContent, skillsIndexRows, renderSkillsIndex, SKILLS_INDEX_FILE } from '../engine/pack_loader/generate-skills-index.mjs';
import { loadPacks, isActive, packEntryId, bundledSkillSources } from '../engine/pack_loader/pack-registry.mjs';

// The canon's own copy, maintained the way the rules index is (engine-tests/rules-index.test.mjs):
// regenerated into the working tree by this test locally, asserted only under CI.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const declaredIds = () => {
  const raw = JSON.parse(readFileSync(join(ROOT, '.claudinite-settings.json'), 'utf8'));
  return (Array.isArray(raw.packs) ? raw.packs : []).map(packEntryId).filter(Boolean);
};

test(`${SKILLS_INDEX_FILE} is current with this repo's declaration`, async () => {
  const rendered = await skillsIndexContent(ROOT);
  assert.ok(rendered, 'the canon mounts skills — an empty index means the generator resolved nothing');
  const path = join(ROOT, SKILLS_INDEX_FILE);
  if (!process.env.CI && (!existsSync(path) || readFileSync(path, 'utf8') !== rendered)) writeFileSync(path, rendered);
  assert.ok(existsSync(path), `${SKILLS_INDEX_FILE} is missing — run this test locally (it regenerates the file) and commit the result`);
  assert.equal(readFileSync(path, 'utf8'), rendered,
    `${SKILLS_INDEX_FILE} is stale — run this test locally (it regenerates the file) and commit the result in the same change that moved a skill or the declaration`);
});

test('the index names exactly the mounted skills, each with its pack, and the scoped ones carry their paths', async () => {
  const packs = await loadPacks({ localRoot: ROOT });
  const active = packs.filter((p) => isActive(p, { packs: declaredIds() }));
  const rows = await skillsIndexRows(ROOT);
  assert.deepEqual(rows.map((r) => r.skill).sort(), [...bundledSkillSources(active).keys()].sort());
  for (const r of rows) assert.ok(active.some((p) => p.id === r.pack), `${r.skill} names a pack that is not active: "${r.pack}"`);
  const scoped = rows.filter((r) => r.paths.length);
  const text = readFileSync(join(ROOT, SKILLS_INDEX_FILE), 'utf8');
  for (const r of scoped) for (const p of r.paths) assert.ok(text.includes(`\`${p}\``), `${r.skill}'s path ${p} is in the file`);
});

test('renderSkillsIndex: scoped skills first, then the rest; nothing to render is null', () => {
  const text = renderSkillsIndex([
    { skill: 'zeta', pack: 'p', description: 'an activity', paths: [] },
    { skill: 'alpha', pack: 'p', description: 'a | pipe', paths: ['wiki/**'] },
  ]);
  assert.ok(text.indexOf('`alpha`') < text.indexOf('`zeta`'));
  assert.ok(text.includes('a \\| pipe'), 'a pipe in a description is escaped for the table');
  assert.equal(renderSkillsIndex([]), null);
});
