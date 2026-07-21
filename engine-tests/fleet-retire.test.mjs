import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retireMigration, runRetirement } from '../migrations/fleet-retire.mjs';

// The migration RETIRE pass — the fleet-wide finalization the daily routine runs as
// phase 3, migrations-owned (no longer in the sheepdog census). Covers the canon-repo
// deletes and the quiescence-gated retirement. GitHub I/O is the injected semantic
// `io` object (each method a GitHub MCP tool); the mock records the calls.

// A mock over the semantic `io` interface. Any path in `absent` reads/removes as a
// no-op (already gone); any in `failDelete` throws from `remove`. `openPrExists` makes
// hasOpenPr report an already-open retire PR. Records the calls (deletes name their
// branch, so a test can assert retirement stages onto the retire branch, not `main`).
function mockIo({ absent = new Set(), failDelete = new Set(), defaultBranch = 'main', openPrExists = false } = {}) {
  const calls = [];
  const io = {
    getDefaultBranch: async () => defaultBranch,
    read: async (_repo, path) => { calls.push(`READ ${path}`); return absent.has(path) ? null : `content:${path}`; },
    ensureBranch: async (_repo, branch, from) => { calls.push(`ENSURE_BRANCH ${branch} <- ${from}`); },
    remove: async (_repo, branch, path) => {
      calls.push(`REMOVE ${branch} ${path}`);
      if (failDelete.has(path)) throw new Error(`delete ${path} returned 409`);
      return !absent.has(path); // tolerate absent (returns false, no throw)
    },
    hasOpenPr: async (_repo, head) => { calls.push(`HAS_OPEN_PR ${head}`); return openPrExists; },
    openPr: async (_repo, head, base) => { calls.push(`OPEN_PR ${head} -> ${base}`); },
  };
  return { io, calls };
}

const canonRepo = 'missingbulb/Claudinite';

test('retireMigration: removes each relocated file (tolerating already-gone), then the record last', async () => {
  const { io, calls } = mockIo({ absent: new Set(['.github/actions/report-failure/action.yml']) });
  const m = {
    id: 'demo', file: '2026-07-13-demo.mjs',
    retireDeletesFromHome: ['.github/workflows/a.yml', '.github/actions/report-failure/action.yml'],
  };
  const line = await retireMigration(io, canonRepo, 'retire-branch', m);

  const record = 'migrations/active_migrations/2026-07-13-demo.mjs';
  const removes = calls.filter((c) => c.startsWith('REMOVE'));
  assert.deepEqual(removes, [
    'REMOVE retire-branch .github/workflows/a.yml',
    'REMOVE retire-branch .github/actions/report-failure/action.yml', // called, tolerated (already gone)
    `REMOVE retire-branch ${record}`,
  ]);
  assert.equal(removes[removes.length - 1], `REMOVE retire-branch ${record}`, 'the record is deleted last');
  assert.match(line, /staged retirement of demo .*\+ 2 canon file\(s\)/);
});

test('retireMigration: a failed delete propagates and leaves the record undeleted (retried next cycle)', async () => {
  const { io, calls } = mockIo({ failDelete: new Set(['.github/workflows/a.yml']) });
  const m = { id: 'demo', file: '2026-07-13-demo.mjs', retireDeletesFromHome: ['.github/workflows/a.yml'] };
  await assert.rejects(retireMigration(io, canonRepo, 'retire-branch', m), /returned 409/);
  assert.ok(!calls.some((c) => c.includes('active_migrations/2026-07-13-demo.mjs')));
});

const quietMigration = (over = {}) => ({
  id: 'demo', file: '2026-07-13-demo.mjs', landed: '2026-07-12', retire: 'auto',
  retireDeletesFromHome: [], legacyPresent: async () => false, ...over,
});

test('runRetirement: no apply evidence (null) -> retires nothing, quiescence unproven', async () => {
  const { io, calls } = mockIo();
  const lines = await runRetirement(io, canonRepo, [quietMigration()], [], 0, '2026-07-13', null);
  assert.match(lines[0], /retiring nothing \(quiescence unproven\)/);
  assert.ok(!calls.some((c) => c.startsWith('REMOVE')));
});

test('runRetirement: a converged+aged migration is staged onto a CI-gated retire PR, never pushed to main', async () => {
  const { io, calls } = mockIo();
  const lines = await runRetirement(io, canonRepo, [quietMigration()], [], 0, '2026-07-13', new Set());
  assert.ok(lines.some((l) => /staged retirement of demo/.test(l)));
  // The deletes ride the retire branch (branched from the default), NOT the default branch itself.
  assert.ok(calls.includes('ENSURE_BRANCH claudinite/retire-migrations <- main'));
  assert.ok(calls.includes('REMOVE claudinite/retire-migrations migrations/active_migrations/2026-07-13-demo.mjs'));
  assert.ok(!calls.some((c) => c.startsWith('REMOVE main ')), 'nothing is deleted straight from main');
  // ...and one PR is opened for review (never auto-merged).
  assert.ok(calls.includes('OPEN_PR claudinite/retire-migrations -> main'));
});

test('runRetirement: an already-open retire PR is not re-opened (amended in place)', async () => {
  const { io, calls } = mockIo({ openPrExists: true });
  await runRetirement(io, canonRepo, [quietMigration()], [], 0, '2026-07-13', new Set());
  // Deletes still refresh the branch, but no duplicate PR is opened.
  assert.ok(calls.includes('REMOVE claudinite/retire-migrations migrations/active_migrations/2026-07-13-demo.mjs'));
  assert.ok(!calls.some((c) => c.startsWith('OPEN_PR')));
});

test('runRetirement: a migration APPLIED this cycle is not retired (the quiescence guard)', async () => {
  const { io, calls } = mockIo();
  const lines = await runRetirement(io, canonRepo, [quietMigration()], [], 0, '2026-07-13', new Set(['demo']));
  assert.ok(!lines.some((l) => /staged retirement of demo/.test(l)));
  assert.ok(!calls.some((c) => c.startsWith('REMOVE')));
  assert.ok(!calls.some((c) => c.startsWith('OPEN_PR')));
});

test('runRetirement: an unclassified repo (unknownCount>0) blocks retirement', async () => {
  const { io, calls } = mockIo();
  const lines = await runRetirement(io, canonRepo, [quietMigration()], [], 1, '2026-07-13', new Set());
  assert.ok(!lines.some((l) => /staged retirement of demo/.test(l)));
  assert.ok(!calls.some((c) => c.startsWith('REMOVE')));
  assert.ok(!calls.some((c) => c.startsWith('OPEN_PR')));
});
