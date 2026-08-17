// The drift guard on CI's WORK-scope sweep.
//
// The work scope judges the branch's diff against a base. Its failure mode is not
// a wrong answer, it is a silent one: with no base ref resolvable, the diff is
// empty, every work rule sees an empty change, and the step passes having judged
// nothing. actions/checkout leaves no `origin/main` behind, so the step must fetch
// the base and name it — and a run that stopped doing either would go on reporting
// success forever, which is exactly the shape of failure the work scope exists to
// catch (#939).
//
// So this reads the step out of ci.yml (where CI actually reads it) and holds the
// three things that make it mean anything: it runs the work runner, it fetches the
// base ref, and it passes that ref explicitly.
//
// It lives in engine-tests/ beside ci-test-roots.test.mjs, the other guard on CI's
// own wiring: the sweep spans the whole repo, so no pack owns it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CI = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');
const RUNNER = 'engine/checks/check_the_work.mjs';

const stepLine = () => {
  const line = CI.split('\n').find((l) => l.includes(RUNNER));
  assert.ok(line, `ci.yml no longer runs ${RUNNER} — the work scope is enforced nowhere but a session's Stop hook`);
  return line;
};

test('CI runs the work runner over the change, not the whole tree', () => {
  assert.match(stepLine(), /--changed/);
});

test('CI names the base ref explicitly — an unresolvable base is an empty diff that passes everything', () => {
  assert.match(stepLine(), /--base\s+origin\/main/);
});

test('CI fetches that base ref before the sweep — a fresh checkout carries no origin/main', () => {
  const fetch = CI.split('\n').find((l) => l.includes('refs/remotes/origin/main'));
  assert.ok(fetch && fetch.includes('git fetch'), 'ci.yml no longer fetches origin/main for the work sweep');
});

// The integration half: the runner really does answer in the shape CI invokes it,
// against this repo's own tree — the real-tree run the fixture cannot stand in for.
test('the runner answers cleanly in CI\'s exact invocation against the real tree', () => {
  const out = execFileSync('node', [RUNNER, '--changed', '--base', 'origin/main'], {
    cwd: REPO, encoding: 'utf8', env: { ...process.env, CLAUDINITE_CHECKS_NO_FETCH: '1' },
  });
  assert.doesNotMatch(out, /\[BLOCKING\]/);
});
