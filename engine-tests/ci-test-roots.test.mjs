// The drift guard on CI's test roots.
//
// `.github/workflows/ci.yml` runs the suite from a CLOSED set of folders. That is the
// right shape — it is short, it is readable, and it does not enumerate directory depth
// — but a closed set has one failure mode: a test written somewhere outside it is never
// run, and CI stays green while covering less. That is not hypothetical. The previous
// form listed globs per depth (`packs-tests/*/skills/*/*.test.mjs`, …) and `vendoring/`
// appeared in none of them, so both of its test files went unrun for as long as they
// existed — a silent 38-test hole nothing reported.
//
// So the root list is declared in ONE place (ci.yml, where CI actually reads it) and
// this test holds it honest: every tracked `*.test.mjs` must fall under a declared root,
// and every declared root must exist. Neither half is optional — the first catches a
// test that escapes the set, the second catches a root left behind after a rename.
//
// It lives in engine-tests/ alongside the canon's other top-level-folder tests
// (migrations.test.mjs, fleet-retire.test.mjs): the roots span the whole repo, so no
// pack owns them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CI = join(REPO, '.github/workflows/ci.yml');

// The one line CI runs. Parsed rather than duplicated: a second copy of the root list
// here would be the very drift this test exists to prevent.
function declaredRoots() {
  const line = readFileSync(CI, 'utf8').split('\n').find((l) => l.trim().startsWith('tests=('));
  assert.ok(line, 'ci.yml no longer has a `tests=(...)` array — this guard has lost its subject');
  const inner = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'));
  return inner.split(/\s+/).filter(Boolean).map((g) => {
    const at = g.indexOf('/**/');
    assert.notEqual(at, -1, `test glob ${g} is not a \`<root>/**/…\` sweep — depth must not be enumerated`);
    return g.slice(0, at);
  });
}

const trackedTests = () => execFileSync('git', ['ls-files', '*.test.mjs'], { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(Boolean);

test('every tracked test file falls under a root ci.yml sweeps', () => {
  const roots = declaredRoots();
  const orphans = trackedTests().filter((f) => !roots.some((r) => f.startsWith(`${r}/`)));
  assert.deepEqual(orphans, [], `these tests are tracked but CI never runs them — move them under a declared root, `
    + `or add the root to ci.yml's tests=(...): ${orphans.join(', ')}`);
});

test('every root ci.yml sweeps still exists', () => {
  const dead = declaredRoots().filter((r) => !existsSync(join(REPO, r)));
  assert.deepEqual(dead, [], `ci.yml sweeps roots that are not in the tree (renamed or deleted): ${dead.join(', ')}`);
});
