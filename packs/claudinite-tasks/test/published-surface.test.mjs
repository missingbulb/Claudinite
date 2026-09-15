import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE SURFACE IS A PROMISE, AND NOTHING HERE PROVED IT STILL LINKS.
// Every module in `shared-code/` re-exports named symbols out of `src/`, which is what
// lets the internals be reorganised without touching a consumer. `export { X } from '…'`
// fails at LINK time when X is gone, so the import below IS the assertion — nothing needs
// to be called.
//
// It is worth a sweep because the failure is invisible from here: the canon imports only
// the names it happens to need, so an internal rename can leave a dead re-export in a
// module no canon file loads, and the first caller to find out is a member, at run time,
// in a repository no canon session reads.

const HERE = dirname(fileURLToPath(import.meta.url));
const SURFACE = join(HERE, '..', 'shared-code');

const modules = readdirSync(SURFACE).filter((f) => f.endsWith('.mjs')).sort();

test('the sweep has a surface to walk', () => {
  // Guards the scan itself: a layout change that emptied this directory would otherwise
  // make every case below vacuous and green.
  assert.ok(modules.length > 5, `expected a real surface, found ${modules.length} modules`);
});

for (const file of modules) {
  test(`shared-code/${file} links against src/`, async () => {
    await import(join(SURFACE, file));
  });
}

// The README's table is how a consumer FINDS the name it needs, so a module missing from
// it is published in name only. Two artifacts that drift independently, and in the
// direction that is easiest to miss: adding a module is exactly when the row gets skipped.
test('every surface module has a row in the README table', () => {
  const readme = readFileSync(join(HERE, '..', 'README.md'), 'utf8');
  const undocumented = modules.filter((f) => !readme.includes(`| \`${f}\` |`));
  assert.deepEqual(undocumented, [],
    `published but absent from the README's surface table, so no consumer can find them:\n  ${undocumented.join('\n  ')}`);
});
