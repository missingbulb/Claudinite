import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rulesIndexContent, rulesIndexImports, RULES_INDEX_FILE, RULES_INDEX_IMPORT,
} from '../engine/pack_loader/generate-rules-index.mjs';
import { loadPacks, isActive, packEntryId } from '../engine/pack_loader/pack-registry.mjs';

// The canon's OWN copy of the CLAUDE.md channel (#807).
//
// Every member gets its index written by `convergeWiring` on the nightly refresh and
// on any pack change. The canon gets nothing: it runs its live tree and mounts no
// Claudinite, so no converge ever touches it — the same asymmetry that let the
// scheduler stub drift here for ten days (#535). So the canon's index is a committed
// artifact maintained the way `packs/directory.GENERATED.md` is: regenerated into the
// working tree by this test locally, asserted only under CI, so a declaration change
// that forgets to regenerate fails there with the fix named.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const declaredIds = () => {
  const raw = JSON.parse(readFileSync(join(ROOT, '.claudinite-settings.json'), 'utf8'));
  return (Array.isArray(raw.packs) ? raw.packs : []).map(packEntryId).filter(Boolean);
};

test(`${RULES_INDEX_FILE} is current with this repo's declaration`, async () => {
  const rendered = await rulesIndexContent(ROOT);
  assert.ok(rendered, 'the canon declares packs — an empty index means the generator resolved nothing');

  const path = join(ROOT, RULES_INDEX_FILE);
  if (!process.env.CI && (!existsSync(path) || readFileSync(path, 'utf8') !== rendered)) {
    writeFileSync(path, rendered);
  }
  assert.ok(existsSync(path), `${RULES_INDEX_FILE} is missing — run this test locally (it regenerates the file) and commit the result`);
  assert.equal(
    readFileSync(path, 'utf8'), rendered,
    `${RULES_INDEX_FILE} is stale against this repo's pack declaration — run this test locally (it regenerates the file) and commit the result in the same change that moved the declaration`,
  );
});

test('the index names exactly the active packs — no more, no fewer', async () => {
  // The property the whole change exists for: the channel is only worth having if what
  // arrives on it is this repo's actual rule set. Compared against the registry's own
  // answer rather than the declaration alone, because the `requires` closure legally
  // adds packs the declaration never names.
  const packs = await loadPacks({ localRoot: ROOT });
  const expected = packs
    .filter((p) => isActive(p, { packs: declaredIds() }) && p.prose)
    .map((p) => p.id)
    .sort();

  const text = readFileSync(join(ROOT, RULES_INDEX_FILE), 'utf8');
  const named = text.split('\n')
    .filter((l) => l.startsWith('@'))
    .map((l) => l.replace(/.*\/packs\/([^/]+)\/.*/, '$1'))
    .sort();

  assert.deepEqual(named, expected);
  // And every declared pack that HAS prose is among them — the failure a member would
  // feel as "I declared this pack and its rules never load".
  for (const id of declaredIds()) {
    const pack = packs.find((p) => p.id === id);
    if (pack?.prose) assert.ok(named.includes(id), `declared pack "${id}" is not imported by the index`);
  }
});

test('every import in the committed index resolves to a file that exists', () => {
  // A delivered index whose imports resolve to nothing is #807 in a new costume: the
  // channel works, the rules still do not arrive, and nothing says so.
  const text = readFileSync(join(ROOT, RULES_INDEX_FILE), 'utf8');
  const paths = text.split('\n').filter((l) => l.startsWith('@')).map((l) => l.slice(1));
  assert.ok(paths.length, 'the index imports nothing');
  for (const rel of paths) {
    assert.ok(existsSync(join(ROOT, '.claudinite', rel)), `dangling import in ${RULES_INDEX_FILE}: @${rel}`);
  }
});

test("the canon's CLAUDE.md imports the index, unquoted", () => {
  // The harness skips `@` mentions inside code spans, so an import in backticks is one
  // it never follows — and `rules-index-current` reads this same file the same way.
  const lines = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').split('\n');
  assert.ok(
    lines.some((l) => !l.includes('`') && l.includes(RULES_INDEX_IMPORT)),
    `CLAUDE.md must carry an unquoted ${RULES_INDEX_IMPORT} line, or the index loads for nobody`,
  );
});

test("every pack's prose is RULES.md or null", async () => {
  // The assumption `rules-index-current` rests on. That rule cannot await a dynamic
  // import, so it spells `RULES.md` rather than reading `prose` off each manifest; a
  // pack that named its prose anything else would make the rule quietly stop checking
  // it. Guarded here rather than worked around there, because the convention is worth
  // keeping on its own.
  for (const pack of await loadPacks({ localRoot: ROOT })) {
    assert.ok(pack.prose === 'RULES.md' || pack.prose === null || pack.prose === undefined,
      `pack "${pack.id}" declares prose "${pack.prose}" — rules-index-current assumes RULES.md`);
  }
});

test('the index carries imports and nothing else', async () => {
  // "ONLY the hard imports" (owner, #807). Anything else here is duplicated context
  // paid for by every session in every repo.
  const lines = (await rulesIndexContent(ROOT)).trim().split('\n');
  const stray = lines.filter((l) => !l.startsWith('@') && !l.startsWith('<!--'));
  assert.deepEqual(stray, [], 'the index must hold only import lines and the generated-file comment');
  assert.equal(lines.filter((l) => l.startsWith('@')).length, (await rulesIndexImports(ROOT)).length);
});
