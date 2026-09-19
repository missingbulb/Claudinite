import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE SURFACE IS A PROMISE, AND NOTHING HERE PROVED IT STILL HOLDS.
// `public/` carries modules and, until #2115, the shims of the paths the surface
// retired. They are checked differently because one kind cannot be checked the other way:
//
//   - a MODULE is imported. `export { X } from '…'` fails at LINK time when X is gone, so
//     importing it IS the assertion — nothing need be called.
//   - a retired COMMAND is an entry point a member's workflow may still run. Importing
//     one may RUN it: `tick.mjs` has no main guard at all and starts a scheduler run on
//     import, by design. So a command is parsed, never imported.
//
// Which is which is read off the README's tables rather than a list here, so the
// documentation a consumer reads is the same artifact the check enforces — and a file
// in no table fails, because a surface nobody can find is not published.
//
// Worth a sweep because the failure is invisible from here: the canon imports only the
// names it happens to need, so an internal rename can leave a dead re-export in a module
// no canon file loads, and the first caller to find out is a member, at run time, in a
// repository no canon session reads.

const HERE = dirname(fileURLToPath(import.meta.url));
const SURFACE = join(HERE, '..', 'public');
const README = readFileSync(join(HERE, '..', 'README.md'), 'utf8');

const files = readdirSync(SURFACE).filter((f) => f.endsWith('.mjs')).sort();

// A table's rows, by the heading of the section that holds it and the header cell that
// opens the table; a section holding two tables is read table by table.
const rowsUnder = (heading, column) => {
  const body = README.split(`### ${heading}`)[1] ?? '';
  const section = body.split(/\n#{2,3} /)[0];
  const table = section.split(`| ${column} |`)[1] ?? '';
  const rows = table.split(/\n\n/)[0];
  const out = new Set();
  for (const m of rows.matchAll(/^\|((?: `[^`]+\.mjs`,?)+) \|/gm)) {
    for (const name of m[1].matchAll(/`([^`]+)`/g)) out.add(name[1]);
  }
  return out;
};

const modules = rowsUnder('Modules other packs import', 'Module');
const retiredCommands = rowsUnder('Retired paths, shimmed until #2115', 'Retired command');
const retiredModules = rowsUnder('Retired paths, shimmed until #2115', 'Retired module');

test('the sweep has a surface to walk, and a README that describes it', () => {
  // Guards the scan itself: a layout change that emptied the folder, or a README edit
  // that renamed a heading, would otherwise make every case below vacuous and green.
  assert.ok(files.length > 5, `expected a real surface, found ${files.length} files`);
  assert.equal(modules.size, 5, 'the module table is the five-file surface');
  assert.ok(retiredCommands.size > 5, 'the retired-command table is missing or empty');
  assert.ok(retiredModules.size > 5, 'the retired-module table is missing or empty');
});

test('every published file is documented in exactly one table', () => {
  const tables = [modules, retiredCommands, retiredModules];
  const undocumented = files.filter((f) => !tables.some((t) => t.has(f)));
  const twice = files.filter((f) => tables.filter((t) => t.has(f)).length > 1);
  assert.deepEqual(undocumented, [], 'published but in no README table, so no consumer can find them');
  assert.deepEqual(twice, [], 'listed in two tables — a reader cannot tell how to use it');
});

for (const file of files) {
  test(`public/${file} ${retiredCommands.has(file) ? 'parses' : 'links'}`, async () => {
    if (!retiredCommands.has(file)) await import(join(SURFACE, file));
    // A command runs on import, so parse it instead: `--check` resolves nothing, which
    // is exactly why a command's real coverage is the test that spawns it.
    else execFileSync(process.execPath, ['--check', join(SURFACE, file)]);
  });
}

// The three definition files are what `src/` builds on, and the promise they make is
// that they reach nothing of `src/`: a member's own pack, and the dashboard's browser
// page, load them with nothing else of the mechanism behind them.
test('the definition files import nothing of src/', () => {
  for (const file of ['task-constants.mjs', 'work-item-grammar.mjs', 'github.mjs']) {
    const text = readFileSync(join(SURFACE, file), 'utf8');
    const reaches = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((s) => s.includes('/src/'));
    assert.deepEqual(reaches, [], `${file} reaches src/`);
  }
});
