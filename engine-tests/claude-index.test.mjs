import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeIndexContent, CLAUDE_INDEX_FILE, CLAUDE_INDEX_IMPORT } from '../engine/pack_loader/generate-claude-index.mjs';

// The canon's OWN copy of the CLAUDE.md channel (#807).
//
// Every member gets its index written by `convergeWiring` on the nightly refresh and
// on any pack change. The canon gets nothing: it runs its live tree and mounts no
// Claudinite, so no converge ever touches it — the same asymmetry that let the
// scheduler stub drift here for ten days (#535). So the canon's index is a committed
// artifact maintained the way `packs/directory.GENERATED.md` is: regenerated into the
// working tree by this test locally, asserted only under CI, so a pack change that
// forgets to regenerate fails there with the fix named.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test(`${CLAUDE_INDEX_FILE} is current with this repo's declaration`, async () => {
  const rendered = await claudeIndexContent(ROOT);
  assert.ok(rendered, 'the canon declares packs — an empty index means the generator resolved nothing');
  assert.match(rendered, /@\.\.\/packs\/basics\/RULES\.md/, 'the baseline must be imported');

  const path = join(ROOT, CLAUDE_INDEX_FILE);
  if (!process.env.CI && (!existsSync(path) || readFileSync(path, 'utf8') !== rendered)) {
    writeFileSync(path, rendered);
  }
  assert.ok(existsSync(path), `${CLAUDE_INDEX_FILE} is missing — run this test locally (it regenerates the file) and commit the result`);
  assert.equal(
    readFileSync(path, 'utf8'), rendered,
    `${CLAUDE_INDEX_FILE} is stale against this repo's pack declaration — run this test locally (it regenerates the file) and commit the result in the same change that moved the declaration`,
  );
});

test('every import in the committed index resolves to a file that exists', async () => {
  // A delivered index whose imports resolve to nothing is #807 in a new costume: the
  // channel works, the rules still do not arrive, and nothing says so.
  const text = readFileSync(join(ROOT, CLAUDE_INDEX_FILE), 'utf8');
  const imports = [...text.matchAll(/(?:^|\s)@(\S+\.md)/g)].map((m) => m[1]);
  assert.ok(imports.length, 'the index imports nothing');
  for (const rel of imports) {
    assert.ok(existsSync(join(ROOT, '.claudinite', rel)), `dangling import in ${CLAUDE_INDEX_FILE}: @${rel}`);
  }
});

test("the canon's CLAUDE.md imports the index, unquoted", async () => {
  // The harness skips `@` mentions inside code spans, so an import in backticks is one
  // it never follows — and the prose injector reads this same file the same way to
  // decide whether it must fall back to injecting the corpus itself.
  const lines = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').split('\n');
  assert.ok(
    lines.some((l) => !l.includes('`') && l.includes(CLAUDE_INDEX_IMPORT)),
    `CLAUDE.md must carry an unquoted ${CLAUDE_INDEX_IMPORT} line, or the index loads for nobody`,
  );
});
