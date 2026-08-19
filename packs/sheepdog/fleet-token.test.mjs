import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  FLEET_TOKEN_PERMISSIONS, fleetTokenGrant, fleetTokenGrantFor, missingFleetTokenError, forbiddenHint,
} from '../../packs/sheepdog/fleet-token.mjs';
import pack from '../../packs/sheepdog/pack.mjs';
import { classifyDispatch } from '../../packs/sheepdog/fleet-api.mjs';
import { main as roster } from '../../packs/sheepdog/tasks/fleet-roster/check-fleet-roster.mjs';
import { main as usage } from '../../packs/sheepdog/tasks/fleet-usage/aggregate-fleet-usage.mjs';
import { main as seeds } from '../../packs/sheepdog/tasks/fleet-pack-seeds/check-fleet-pack-seeds.mjs';
import { main as baseline } from '../../packs/sheepdog/tasks/fleet-baseline/force-fleet-baseline.mjs';
import { main as addPacks } from '../../packs/sheepdog/tasks/fleet-add-missing-packs/worker.mjs';

// The token is granted ONCE, for the whole pack, so what any one sweep says when it is
// missing has to be the union — defensible per-sweep messages are how a fleet went two
// days without `Pull requests: read` (#1030). These tests hold the union. The digest
// that needed that permission now lives in claudinite-dashboard and states its own
// grant; packs/claudinite-dashboard/tasks/fleet-digest/fleet-token.test.mjs
// holds that one.

const SWEEPS = [
  ['fleet-roster', roster],
  ['fleet-usage', usage],
  ['fleet-pack-seeds', seeds],
  ['fleet-baseline', baseline],
  ['fleet-add-missing-packs', addPacks],
];

for (const [id, main] of SWEEPS) {
  test(`${id} names the WHOLE grant when the token is missing`, async () => {
    const saved = { ...process.env };
    delete process.env.FLEET_GITHUB_TOKEN;
    process.env.GITHUB_REPOSITORY = 'owner/enforcer';
    // fleet-add-missing-packs parses its parameters before it reaches the token; they
    // have no defaults, so a run without them fails on the parameter, not the grant.
    process.env.CLAUDINITE_CONTEXT = 'SCAN_FOR_NEEDED_PACKS=true\nREPOS=all-covered-members';
    try {
      await assert.rejects(async () => main(), (e) => {
        for (const p of FLEET_TOKEN_PERMISSIONS) {
          assert.match(e.message, new RegExp(`${p.permission} ${p.access}`),
            `${id}'s message omits ${p.permission} ${p.access}`);
        }
        return true;
      });
    } finally {
      process.env = saved;
    }
  });
}

test('a sweep also names its own subset, which is never what to grant', () => {
  const msg = missingFleetTokenError('fleet-usage', 'detail.').message;
  assert.match(msg, /this one, fleet-usage, uses Metadata read, Contents read/);
  assert.match(msg, /detail\.$/);
  // Every sweep in the table claims at least one permission — a sweep id that matches
  // nothing would silently render "uses " and read as needing none.
  for (const [id] of SWEEPS) assert.notEqual(fleetTokenGrantFor(id), '');
});

test('adoption hands a human the complete grant, not a sweep-shaped subset', () => {
  const [step] = pack.adoptionHandover;
  assert.match(step.step, new RegExp(fleetTokenGrant().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(step.step, /FLEET_GITHUB_TOKEN/);
  assert.ok(step.breaks && step.done);
});

test('a 403 is attributed to the permission that would fix it', () => {
  assert.match(forbiddenHint('/repos/o/r/contents/.claudinite-checks.json'), /Contents: read and write/);
  assert.match(forbiddenHint('/repos/o/r/issues?labels=x'), /Issues: read and write/);
  assert.match(forbiddenHint('/user/repos'), /Metadata: read/);
  assert.match(classifyDispatch(403).detail, /Actions: read and write/);
  // No row claims this path, and a wrong guess is worse than none.
  assert.equal(forbiddenHint('/rate_limit'), '');
});

// The regression this whole change exists to prevent: a new sweep spelling its own
// subset into its own message. One permission name beside an access word is ordinary
// prose ("dispatching is an Actions write"); two or more in the same breath is a LIST,
// and a list belongs in exactly one file.
test('no file in the pack spells a permission list but fleet-token.mjs', () => {
  // The pack's own tests are out of scope: a test that asserts on the grant has to
  // name the permissions it is asserting about, and no test text reaches a member.
  const files = execFileSync('git', ['ls-files', 'packs/sheepdog'], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((f) => f !== 'packs/sheepdog/fleet-token.mjs' && !f.endsWith('.test.mjs'));
  const names = FLEET_TOKEN_PERMISSIONS.map((p) => p.permission).join('|');
  const pair = new RegExp(`(${names})\\b[^.\\n]{0,12}?\\b(read and write|read/write|read \\+ write|read|write)\\b`, 'gi');
  const offenders = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    // Two consecutive lines, because a wrapped paragraph and a concatenated string
    // literal both split a list across a line break.
    for (let i = 0; i < lines.length; i += 1) {
      const window = `${lines[i]} ${lines[i + 1] ?? ''}`;
      const hits = new Set([...window.matchAll(pair)].map((m) => m[1].toLowerCase()));
      if (hits.size >= 2) offenders.push(`${file}:${i + 1} — ${[...hits].join(', ')}`);
    }
  }
  assert.deepEqual(offenders, [], `a permission list outside fleet-token.mjs:\n${offenders.join('\n')}`);
});
