import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  FLEET_TOKEN_PERMISSIONS, fleetTokenGrant, missingFleetTokenError, forbiddenHint,
} from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/fleet-token.mjs';
import pack from '../../../../packs/claudinite-dashboard/pack.mjs';
import { paged } from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/fleet-reads.mjs';
import { main as digest } from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/worker.mjs';

// The permission a person is likeliest to leave out is the one only this task uses,
// and only once a member is private: a fine-grained PAT reads a PUBLIC repo's pull
// requests without `Pull requests: read`, so a fleet runs green until the day someone
// adds a private repo (#1030). So the grant is stated once, in fleet-token.mjs, and
// every place that mentions it renders from there.

test('the digest names the whole grant when the token is missing', async () => {
  const saved = { ...process.env };
  delete process.env.FLEET_GITHUB_TOKEN;
  process.env.GITHUB_REPOSITORY = 'owner/enforcer';
  process.env.GITHUB_TOKEN = 'not-the-fleet-token'; // checked before the fleet token
  try {
    await assert.rejects(async () => digest(), (e) => {
      for (const p of FLEET_TOKEN_PERMISSIONS) {
        assert.match(e.message, new RegExp(`${p.permission} ${p.access}`), `omits ${p.permission}`);
      }
      // An absent secret is a person adding one, not a failure to read a stack trace.
      assert.equal(e.triage, 'action');
      return true;
    });
  } finally {
    process.env = saved;
  }
});

test('one secret, two packs: the message says grant the union', () => {
  assert.match(missingFleetTokenError('detail.').message, /sheepdog/);
  // Found by what it is about, not by where it sits: the pack hands over several
  // human-only steps and their order is not this test's business — pinning the last
  // one made any new entry fail here instead of where it was added.
  const step = pack.adoptionHandover.find((h) => /FLEET_GITHUB_TOKEN/.test(h.step));
  assert.ok(step, 'no handover entry asks for the fleet token');
  assert.match(step.step, new RegExp(fleetTokenGrant().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('a 403 mid-walk is attributed to the permission that would fix it', async () => {
  const gh = async () => ({ status: 403, json: { message: 'Resource not accessible' } });
  await assert.rejects(() => paged(gh, '/repos/o/private/pulls?state=closed'), (e) => {
    assert.match(e.message, /Pull requests: read/);
    assert.equal(e.triage, 'action', 'a refused read parks for a person, not for a debugger');
    return true;
  });
  assert.match(forbiddenHint('/repos/o/r/issues?since=x'), /Issues: read/);
  assert.equal(forbiddenHint('/rate_limit'), '', 'no row claims it, and a wrong guess is worse than none');
});

// The regression: a read spelling its own subset where it lives. One permission name
// beside an access word is ordinary prose; two in the same breath is a LIST, and the
// list belongs in exactly one file.
test('no file in the task spells a permission list but fleet-token.mjs', () => {
  const dir = 'packs/claudinite-dashboard/tasks/fleet-digest';
  const files = execFileSync('git', ['ls-files', dir], { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => f !== `${dir}/fleet-token.mjs`);
  const names = FLEET_TOKEN_PERMISSIONS.map((p) => p.permission).join('|');
  const pair = new RegExp(`(${names})\\b[^.\\n]{0,12}?\\b(read and write|read/write|read \\+ write|read|write)\\b`, 'gi');
  const offenders = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const window = `${lines[i]} ${lines[i + 1] ?? ''}`;
      const hits = new Set([...window.matchAll(pair)].map((m) => m[1].toLowerCase()));
      if (hits.size >= 2) offenders.push(`${file}:${i + 1} — ${[...hits].join(', ')}`);
    }
  }
  assert.deepEqual(offenders, [], `a permission list outside fleet-token.mjs:\n${offenders.join('\n')}`);
});
