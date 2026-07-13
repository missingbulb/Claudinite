import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheepdogConfig, retireMigration } from './check-fleet-coverage.mjs';

// The sheepdog census reads its fleet scope from the enforcer repo's
// packConfig.sheepdog. (The work plan is the CORE planner's job — see
// routines/fleet/plan.test.mjs — and no longer lives here.)
test('parseSheepdogConfig: reads owner + exclude; defaults owner to the home owner; throws when absent', () => {
  const cfg = { packConfig: { sheepdog: { owner: 'MissingBulb', exclude: ['Owner/Repo-A', 'owner/repo-b'] } } };
  const { owner, exclude } = parseSheepdogConfig(cfg, 'missingbulb/sheepdog');
  assert.equal(owner, 'missingbulb');
  assert.ok(exclude.has('owner/repo-a') && exclude.has('owner/repo-b'));
  // owner defaults to the home repo's owner
  assert.equal(parseSheepdogConfig({ packConfig: { sheepdog: {} } }, 'acme/fleet').owner, 'acme');
  // absent packConfig.sheepdog aborts (absence is not "cover everything")
  assert.throws(() => parseSheepdogConfig({}, 'acme/fleet'), /no packConfig\.sheepdog/);
});

// A mock GitHub client that records calls; any content path in `absent` reads as
// a 404 (already gone), everything else as present with a resolvable sha.
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

  const deletes = calls.filter((c) => c.startsWith('DELETE'));
  // a.yml present -> deleted; report-failure 404 -> skipped; record deleted LAST.
  assert.deepEqual(deletes, [
    `DELETE /repos/${home}/contents/.github/workflows/a.yml`,
    `DELETE /repos/${home}/contents/migrations/2026-07-13-demo.mjs`,
  ]);
  assert.equal(calls[calls.length - 1], `DELETE /repos/${home}/contents/migrations/2026-07-13-demo.mjs`);
  assert.match(line, /retired demo .*\+ 2 home file\(s\)/);
});

test('retireMigration: a failed home delete propagates and leaves the record undeleted (retried next night)', async () => {
  const home = 'missingbulb/Claudinite';
  const { gh, calls } = mockGh(home, { failDelete: new Set(['.github/workflows/a.yml']) });
  const m = { id: 'demo', file: '2026-07-13-demo.mjs', retireDeletesFromHome: ['.github/workflows/a.yml'] };
  await assert.rejects(retireMigration(gh, home, m), /returned 409/);
  // The record delete was never reached — the migration survives to retry.
  assert.ok(!calls.some((c) => c.includes('migrations/2026-07-13-demo.mjs')));
});
