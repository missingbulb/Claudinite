import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE SURFACE IS A PROMISE, AND NOTHING HERE PROVED IT STILL HOLDS.
// `public/` carries two kinds of thing, and they are checked differently because one
// of them cannot be checked the other way:
//
//   - a MODULE re-exports named symbols out of `src/`. `export { X } from '…'` fails at
//     LINK time when X is gone, so importing it IS the assertion — nothing need be called.
//   - a COMMAND is an entry point a workflow or a doc runs. Importing one RUNS it:
//     `tick.mjs` has no main guard at all and starts a scheduler run on import, by
//     design. So a command is parsed, never imported, and its behaviour is its own
//     test's subject.
//
// Which is which is read off the README's two tables rather than a list here, so the
// documentation a consumer reads is the same artifact the check enforces — and a file
// in neither table fails, because a surface nobody can find is not published.
//
// Worth a sweep because the failure is invisible from here: the canon imports only the
// names it happens to need, so an internal rename can leave a dead re-export in a module
// no canon file loads, and the first caller to find out is a member, at run time, in a
// repository no canon session reads.

const HERE = dirname(fileURLToPath(import.meta.url));
const SURFACE = join(HERE, '..', 'public');
const README = readFileSync(join(HERE, '..', 'README.md'), 'utf8');

const files = readdirSync(SURFACE).filter((f) => f.endsWith('.mjs')).sort();

// A table's rows, by the section heading above them.
const rowsUnder = (heading) => {
  const body = README.split(`### ${heading}`)[1] ?? '';
  const next = body.split(/\n#{2,3} /)[0];
  return new Set([...next.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]));
};

const commands = rowsUnder('Commands and documents named from outside');
const modules = rowsUnder('Modules other packs import');

test('the sweep has a surface to walk, and a README that describes it', () => {
  // Guards the scan itself: a layout change that emptied the folder, or a README edit
  // that renamed a heading, would otherwise make every case below vacuous and green.
  assert.ok(files.length > 5, `expected a real surface, found ${files.length} files`);
  assert.ok(commands.size > 5, 'the command table is missing or empty');
  assert.ok(modules.size > 5, 'the module table is missing or empty');
});

test('every published file is documented in exactly one table', () => {
  const undocumented = files.filter((f) => !commands.has(f) && !modules.has(f));
  const both = files.filter((f) => commands.has(f) && modules.has(f));
  assert.deepEqual(undocumented, [], 'published but in neither README table, so no consumer can find them');
  assert.deepEqual(both, [], 'listed as both a command and a module — a reader cannot tell how to use it');
});

for (const file of files) {
  test(`public/${file} ${modules.has(file) ? 'links against src/' : 'parses'}`, async () => {
    if (modules.has(file)) await import(join(SURFACE, file));
    // A command runs on import, so parse it instead: `--check` resolves nothing, which
    // is exactly why a command's real coverage is the test that spawns it.
    else execFileSync(process.execPath, ['--check', join(SURFACE, file)]);
  });
}
