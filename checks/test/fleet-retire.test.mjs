import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retireMigration, runRetirement, readAppliedThisCycle } from '../../migrations/fleet-retire.mjs';

// The migration RETIRE pass — the fleet-wide finalization the daily routine runs as
// phase 3, migrations-owned (no longer in the sheepdog census). Covers the home-repo
// deletes, the apply-evidence reader, and the quiescence-gated retirement.

// A mock GitHub client that records calls; any content path in `absent` reads as a
// 404 (already gone), everything else as present with a resolvable sha.
function mockGh(home, { absent = new Set(), failDelete = new Set() } = {}) {
  const calls = [];
  const gh = async (path, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${path}`);
    const rel = path.replace(`/repos/${home}/contents/`, '');
    if (method === 'GET') return absent.has(rel) ? { status: 404, json: {} } : { status: 200, json: { sha: `sha:${rel}` } };
    return failDelete.has(rel) ? { status: 409, json: {} } : { status: 200, json: {} };
  };
  return { gh, calls };
}

test('retireMigration: deletes each present home file (tolerating already-gone), then the record last', async () => {
  const home = 'missingbulb/Claudinite';
  const { gh, calls } = mockGh(home, { absent: new Set(['.github/actions/report-failure/action.yml']) });
  const m = {
    id: 'demo', file: '2026-07-13-demo.mjs',
    retireDeletesFromHome: ['.github/workflows/a.yml', '.github/actions/report-failure/action.yml'],
  };
  const line = await retireMigration(gh, home, m);

  const record = 'migrations/active_migrations/2026-07-13-demo.mjs';
  const deletes = calls.filter((c) => c.startsWith('DELETE'));
  assert.deepEqual(deletes, [
    `DELETE /repos/${home}/contents/.github/workflows/a.yml`,
    `DELETE /repos/${home}/contents/${record}`,
  ]);
  assert.equal(calls[calls.length - 1], `DELETE /repos/${home}/contents/${record}`);
  assert.match(line, /retired demo .*\+ 2 canon file\(s\)/);
});

test('retireMigration: a failed home delete propagates and leaves the record undeleted (retried next cycle)', async () => {
  const home = 'missingbulb/Claudinite';
  const { gh, calls } = mockGh(home, { failDelete: new Set(['.github/workflows/a.yml']) });
  const m = { id: 'demo', file: '2026-07-13-demo.mjs', retireDeletesFromHome: ['.github/workflows/a.yml'] };
  await assert.rejects(retireMigration(gh, home, m), /returned 409/);
  assert.ok(!calls.some((c) => c.includes('active_migrations/2026-07-13-demo.mjs')));
});

test('readAppliedThisCycle: absent -> null (quiescence unproven); present -> Set; unparsable -> null', () => {
  const p = join(tmpdir(), `applied-${process.pid}.json`);
  try {
    assert.equal(readAppliedThisCycle(p), null); // absent
    writeFileSync(p, JSON.stringify(['a', 'b']));
    const s = readAppliedThisCycle(p);
    assert.ok(s instanceof Set && s.has('a') && s.has('b'));
    writeFileSync(p, 'not json');
    assert.equal(readAppliedThisCycle(p), null);
  } finally { rmSync(p, { force: true }); }
});

const home = 'missingbulb/Claudinite';
const quietMigration = (over = {}) => ({
  id: 'demo', file: '2026-07-13-demo.mjs', landed: '2026-07-12', retire: 'auto',
  retireDeletesFromHome: [], legacyPresent: async () => false, ...over,
});

test('runRetirement: no apply evidence (null) -> retires nothing, quiescence unproven', async () => {
  const { gh, calls } = mockGh(home);
  const lines = await runRetirement(gh, home, [quietMigration()], [], 0, '2026-07-13', null);
  assert.match(lines[0], /retiring nothing \(quiescence unproven\)/);
  assert.ok(!calls.some((c) => c.startsWith('DELETE')));
});

test('runRetirement: a converged+aged migration is retired when the cycle was quiet for it', async () => {
  const { gh, calls } = mockGh(home);
  const lines = await runRetirement(gh, home, [quietMigration()], [], 0, '2026-07-13', new Set());
  assert.ok(lines.some((l) => /retired demo/.test(l)));
  assert.ok(calls.some((c) => c === `DELETE /repos/${home}/contents/migrations/active_migrations/2026-07-13-demo.mjs`));
});

test('runRetirement: a migration APPLIED this cycle is not retired (the quiescence guard)', async () => {
  const { gh, calls } = mockGh(home);
  const lines = await runRetirement(gh, home, [quietMigration()], [], 0, '2026-07-13', new Set(['demo']));
  assert.ok(!lines.some((l) => /retired demo/.test(l)));
  assert.ok(!calls.some((c) => c.startsWith('DELETE')));
});

test('runRetirement: an unclassified repo (unknownCount>0) blocks retirement', async () => {
  const { gh, calls } = mockGh(home);
  const lines = await runRetirement(gh, home, [quietMigration()], [], 1, '2026-07-13', new Set());
  assert.ok(!lines.some((l) => /retired demo/.test(l)));
  assert.ok(!calls.some((c) => c.startsWith('DELETE')));
});
