// See-it-fail proof for dated-fixture-collision. The violating fixture is the literal state the
// enforcer repo's own #130 landed to clear — worker.test.mjs asserting on a digests/ path dated
// inside the window the fleet actually runs in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import rule from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/dated-fixture-collision.mjs';

// The digest's own worker test — the file the rule exists to keep honest, and the one whose
// real content the last case reads back. Named once here rather than spelled at each use.
const SUBJECT = 'packs/claudinite-dashboard/tasks/fleet-digest/worker.test.mjs';

// Only `read` and `allFiles` are touched; anything else would be a rule reaching too far.
const ctx = (fs) => ({ allFiles: Object.keys(fs), read: (p) => (p in fs ? fs[p] : null) });

// The violating fixtures are ASSEMBLED, never written as one literal. This file is itself a
// `.test.mjs` in a pack the repo declares, so a contiguous `digests/<20xx date>` here would make
// the rule find its own proof and go red on a clean tree. Joining at runtime keeps the fixture
// honest — the rule still scans the exact forbidden string — while leaving the rule hole-free:
// the alternative, exempting this filename, is a hole a real colliding fixture could later hide in.
const dated = (d) => `digests/${d}.md`;

test('the pre-#130 fixture is found', () => {
  const found = rule.run(ctx({
    [SUBJECT]: `assert.deepEqual(Object.keys(r.quietFiles), ['${dated('2026-08-04')}'], 'here');\n`,
  }));
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'blocking', 'a test that can pass for the wrong reason is a defect, not a transient');
  assert.equal(found[0].file, SUBJECT);
  assert.match(found[0].what, /2026-08-04/);
  assert.match(found[0].fix, /1999/);
});

test('every colliding date in one file is named, once each', () => {
  const found = rule.run(ctx({
    [SUBJECT]: `['${dated('2026-08-04')}', '${dated('2026-08-04')}', '${dated('2031-01-09')}']\n`,
  }));
  assert.equal(found.length, 1, 'one finding per file, not per hit');
  assert.match(found[0].what, /2026-08-04, 2031-01-09/);
});

test('a fixture dated outside the fleet years is clean', () => {
  assert.deepEqual(rule.run(ctx({
    [SUBJECT]: `assert.deepEqual(Object.keys(r.quietFiles), ['${dated('1999-03-04')}'], 'here');\n`,
  })), [], '1999 cannot collide — this is the escape the rule steers toward');
});

test('real-looking dates that build no digests/ path are not subjects', () => {
  // #130 deliberately kept these: backfillDates/asOf assert date arithmetic against a fixed NOW
  // and construct no artifact path, so there is nothing for them to collide with.
  assert.deepEqual(rule.run(ctx({
    [SUBJECT]: "assert.equal(asOf('2026-08-08').toISOString(), '2026-08-09T00:00:00.000Z');\n",
  })), []);
});

test('only test files are subjects', () => {
  const text = `writeFileSync('${dated('2026-08-04')}', brief);\n`;
  assert.deepEqual(rule.run(ctx({
    'packs/claudinite-dashboard/tasks/fleet-digest/worker.mjs': text,
    'digests/README.md': text,
  })), [], 'production code and real artifacts name real dates by design');
});

test('the read-only canon mount is not policed', () => {
  assert.deepEqual(rule.run(ctx({
    '.claudinite/shared/packs/sheepdog/some.test.mjs': `'${dated('2026-08-04')}'\n`,
  })), []);
});

test('inert where it does not apply', () => {
  assert.deepEqual(rule.run(ctx({})), []);
  assert.deepEqual(rule.run(ctx({ [SUBJECT]: 'no artifact paths here\n' })), []);
});

test("the digest's own test files are clean", () => {
  // The real file, not a fixture: this is the case that catches a fixture date drifting back
  // into the 20xx range as the digest's tests are edited.
  const fs = { [SUBJECT]: readFileSync(SUBJECT, 'utf8') };
  assert.deepEqual(rule.run(ctx(fs)), [], 'the digest fixtures are dated 1999 on purpose');
});
