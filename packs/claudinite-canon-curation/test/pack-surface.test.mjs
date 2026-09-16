import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSurfaceReport, publishedNames, consumerBucket, readSurfaceUse } from '../pack-surface.mjs';

// Maintained the way packs/directory.GENERATED.md is (engine-tests/pack-directory.test.mjs):
// locally this test rewrites the artifact, under CI it only asserts, so a change that
// widens a published surface without regenerating fails in ITS OWN pull request rather
// than in a later sweep's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PACK_DIR = 'packs/claudinite-tasks';
const REPORT = `${PACK_DIR}/public/SURFACE.GENERATED.md`;

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claudinite-cache']);

// Two files are held out of the scan, both because they would report themselves. The
// artifact names every module, so it would make each one read as consumed by the canon;
// this file carries import statements as fixture DATA, which the scanner cannot tell
// from the real thing — it read a fixture's `unreadName` as a live import of a name the
// surface has never had.
const SELF = relative(ROOT, fileURLToPath(import.meta.url)).split(sep).join('/');

// The tree, read once. Only text the surface can be named from is worth scanning.
function treeText(dir = ROOT, files = new Map()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) { treeText(abs, files); continue; }
    if (!entry.isFile() || !/\.(mjs|js|json|md|yml|yaml)$/.test(entry.name)) continue;
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel === REPORT || rel === SELF) continue;
    files.set(rel, readFileSync(abs, 'utf8'));
  }
  return files;
}

test(`${REPORT} is current with the tree`, () => {
  const files = treeText();
  assert.ok(files.size > 100, `only ${files.size} files read — a partial checkout cannot judge a surface`);

  const rendered = renderSurfaceReport({ packDir: PACK_DIR, files });
  const modules = readSurfaceUse({ files, packDir: PACK_DIR });
  assert.ok(modules.size >= 20, `only ${modules.size} public/ modules found — the folder's scope has moved out from under this test`);

  const path = join(ROOT, REPORT);
  if (!process.env.CI && (!existsSync(path) || readFileSync(path, 'utf8') !== rendered)) writeFileSync(path, rendered);
  assert.ok(existsSync(path), `${REPORT} is missing — run this test locally (it regenerates the file) and commit the result`);
  assert.equal(
    readFileSync(path, 'utf8'), rendered,
    `${REPORT} is stale — run this test locally (it regenerates the file) and commit the result in the same change that moved the surface`,
  );
});

// The scope assertion has to fail loudly: a packDir left behind by a layout change
// matches no module, and an empty report reads as "this pack publishes nothing".
test('a pack directory with no public/ modules is an error, not an empty report', () => {
  assert.throws(
    () => readSurfaceUse({ files: new Map([['packs/elsewhere/src/a.mjs', 'export const a = 1;']]), packDir: 'packs/nothing-here' }),
    /no public\/ modules found/,
  );
});

test('publishedNames reads every export form, and the alias is what the outside sees', () => {
  const { names, wildcards } = publishedNames([
    "export { a, b as renamed } from '../src/one.mjs';",
    'export {',
    '  wrapped, alsoWrapped,',
    "} from '../src/two.mjs';",
    'export const CONST = 1;',
    'export function fn() {}',
    'export class Klass {}',
  ].join('\n'));
  assert.deepEqual(names, ['CONST', 'Klass', 'a', 'alsoWrapped', 'fn', 'renamed', 'wrapped']);
  assert.deepEqual(wildcards, []);
});

// A star is reported as a star. Expanding it into the target's current names would
// print a promise the folder never made — the whole point of flagging it.
test('publishedNames keeps a wildcard separate from the names beside it', () => {
  const { names, wildcards } = publishedNames("export * from '../src/loop.mjs';\nexport { runIt } from '../src/loop.mjs';");
  assert.deepEqual(names, ['runIt']);
  assert.deepEqual(wildcards, ['../src/loop.mjs']);
  assert.deepEqual(publishedNames("export * as ns from '../src/loop.mjs';"), { names: ['ns'], wildcards: [] });
});

test('consumerBucket separates a live dependency from the canon proving its own contract', () => {
  const b = (p) => consumerBucket(p, PACK_DIR);
  assert.equal(b('.github/workflows/claudinite-executor.yml'), 'workflow');
  assert.equal(b('packs/claudinite-dashboard/src/derive/board.mjs'), 'pack');
  assert.equal(b('packs/claudinite-dashboard/test/board.test.mjs'), 'pack (test)');
  assert.equal(b('.claudinite/local/packs/claudinite/RULES.md'), 'pack');
  assert.equal(b('bootstrap.md'), 'canon');
  assert.equal(b('engine-tests/migrations.test.mjs'), 'canon (test)');
  assert.equal(b(`${PACK_DIR}/src/execute/loop.mjs`), 'own pack');
});

// Run from a member, the pack's own internals are spelled through the mount. Reading
// them as an external pack would count every name they import as taken — and a pack
// imports its own surface far more than any consumer does, so the inflation lands
// hardest on exactly the modules the report is consulted about.
test('the pack reached through the mount is still the pack itself', () => {
  assert.equal(consumerBucket(`.claudinite/shared/${PACK_DIR}/src/execute/loop.mjs`, PACK_DIR), 'own pack');
  assert.equal(consumerBucket('.claudinite/local/packs/other/worker.mjs', PACK_DIR), 'pack');

  const files = new Map([
    [`${PACK_DIR}/public/executor.mjs`, "export { runExecutor } from '../src/execute/loop.mjs';"],
    [`.claudinite/shared/${PACK_DIR}/src/execute/loop.mjs`, "import { runExecutor } from '../../public/executor.mjs';"],
  ]);
  const mod = readSurfaceUse({ files, packDir: PACK_DIR }).get('executor.mjs');
  assert.deepEqual([...mod.consumers.keys()], [], 'the pack is not a consumer of itself under any spelling');
  assert.deepEqual([...mod.used], [], 'nor does its own import count as a name taken');
});

// Three spellings reach one module — a sibling pack's relative path, a member's mount
// path, and the pack's own — and all three have to land on the same row, or the report
// undercounts exactly the consumers that cannot be rewritten from here.
test('readSurfaceUse counts every spelling of the same module, and ignores the pack itself', () => {
  const files = new Map([
    [`${PACK_DIR}/public/work-items.mjs`, "export { isQueueItem, unreadName } from '../src/items/work-item.mjs';"],
    ['packs/claudinite-dashboard/src/derive/board.mjs', "import { isQueueItem } from '../../../claudinite-tasks/public/work-items.mjs';"],
    ['packs/other/test/a.test.mjs', "import { isQueueItem } from '../../claudinite-tasks/public/work-items.mjs';"],
    ['docs/guide.md', 'node .claudinite/shared/packs/claudinite-tasks/public/work-items.mjs'],
    [`${PACK_DIR}/src/execute/loop.mjs`, "import { unreadName } from '../../public/work-items.mjs';"],
  ]);
  const mod = readSurfaceUse({ files, packDir: PACK_DIR }).get('work-items.mjs');
  assert.deepEqual([...mod.consumers.keys()].sort(), ['canon', 'pack', 'pack (test)']);
  assert.deepEqual([...mod.used], ['isQueueItem'], 'a name only the pack itself imports is not taken from outside');

  const rendered = renderSurfaceReport({ packDir: PACK_DIR, files });
  assert.match(rendered, /\| `work-items\.mjs` \| 2 \| 1 \| `unreadName` \|/, 'the unread name is named in its own column');
  assert.match(rendered, /pack: claudinite-dashboard/);
});

// A path named in a comment costs the pack nothing to move, so counting it as a reader
// inflates exactly the number the report is read for. Both spellings that cross the
// canon — a `//` comment in code, a remedy sentence in a declared check — are mentions.
test('a path named only in prose is a mention, never a reader', () => {
  const files = new Map([
    [`${PACK_DIR}/public/executor.mjs`, "export { runExecutor } from '../src/execute/loop.mjs';"],
    ['packs/other/worker.mjs', '// hands off to the executor (packs/claudinite-tasks/public/executor.mjs) instead'],
    ['packs/other/declared-checks.json', '"fix": "run node .claudinite/shared/packs/claudinite-tasks/public/executor.mjs"'],
    ['.github/workflows/x.yml', '        run: node packs/claudinite-tasks/public/executor.mjs'],
  ]);
  const mod = readSurfaceUse({ files, packDir: PACK_DIR }).get('executor.mjs');
  assert.deepEqual([...mod.consumers.keys()], ['workflow'], 'only the workflow actually runs it');
  assert.equal(mod.mentions.size, 2, 'the code comment and the quoted remedy are both mentions');
  assert.match(renderSurfaceReport({ packDir: PACK_DIR, files }), /workflow: \.github; 2 prose mentions/);
});

// A document is consumed BY being named — a routine's stored prompt and a worker's
// spec are prose pointing at it, and there is no import to find. Reading its mentions
// as non-readers would print `**nobody**` for the one file whose whole job is to be
// named from outside.
test('a document in public/ counts every reference as a reader', () => {
  const files = new Map([
    [`${PACK_DIR}/public/instructions.md`, '# the work-item routine'],
    ['bootstrap.md', 'Execute: `.claudinite/shared/packs/claudinite-tasks/public/instructions.md`.'],
    ['packs/other/tasks/update/task.md', '(`.claudinite/shared/packs/claudinite-tasks/public/instructions.md`): everything a task'],
  ]);
  const mod = readSurfaceUse({ files, packDir: PACK_DIR }).get('instructions.md');
  assert.equal(mod.mentions.size, 0, 'prose naming a document is how a document is read');
  assert.deepEqual([...mod.consumers.keys()].sort(), ['canon', 'pack']);
});

test('a module nothing outside reads says so, rather than rendering an empty cell', () => {
  const files = new Map([[`${PACK_DIR}/public/orphan.mjs`, 'export const held = 1;']]);
  assert.match(renderSurfaceReport({ packDir: PACK_DIR, files }), /\| `orphan\.mjs` \| 1 \| — \| `held` \| \*\*nobody\*\* \|/);
});
