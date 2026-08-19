import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import pack from '../../packs/sheepdog/pack.mjs';
import {
  FLEET_TOKEN, FLEET_TOKEN_PERMISSIONS, fleetTokenGrant, fleetTokenGrantDetail, requireFleetToken,
} from '../../packs/sheepdog/fleet-token.mjs';

// What these tests defend is not the wording of a permission list — it is that there is
// only ONE of them. The failure they were written against is missingbulb/Shepherd#37: an
// enforcer adopted with a PAT short of Pull requests read, because the list reached the
// person granting it from a sweep's own error string rather than from the pack.

const ROOT = new URL('../../', import.meta.url).pathname;

test('the grant renders every permission, at its level', () => {
  const grant = fleetTokenGrant();
  for (const { permission, level } of FLEET_TOKEN_PERMISSIONS) {
    assert.ok(grant.includes(`${permission} ${level}`), `${permission} missing from the grant line`);
  }
  // The row the whole incident turned on: the only sweep that needs it is the digest,
  // and a public-only fleet never notices its absence.
  assert.ok(FLEET_TOKEN_PERMISSIONS.some((p) => p.permission === 'Pull requests' && p.level === 'read'));
});

test('every row says which sweep forces it', () => {
  for (const { permission, why } of FLEET_TOKEN_PERMISSIONS) {
    assert.ok(why && why.trim() !== '', `${permission} carries no reason`);
  }
  assert.equal(fleetTokenGrantDetail().length, FLEET_TOKEN_PERMISSIONS.length);
});

test('requireFleetToken returns the secret, or throws the WHOLE grant', () => {
  assert.equal(requireFleetToken({ [FLEET_TOKEN]: 'ghp_x' }), 'ghp_x');
  assert.throws(() => requireFleetToken({}), (e) => {
    assert.ok(e.message.includes(FLEET_TOKEN));
    for (const { permission } of FLEET_TOKEN_PERMISSIONS) {
      assert.ok(e.message.includes(permission), `${permission} missing from the not-set error`);
    }
    return true;
  });
});

test('adoption is told the complete grant', () => {
  const [handover, ...rest] = pack.adoptionHandover ?? [];
  assert.ok(handover, 'the pack declares no adoptionHandover, so adoption never asks for the PAT');
  assert.equal(rest.length, 0);
  assert.ok(handover.step.includes(FLEET_TOKEN));
  for (const { permission } of FLEET_TOKEN_PERMISSIONS) {
    assert.ok(handover.step.includes(permission), `${permission} missing from the handover step`);
  }
  for (const k of ['step', 'breaks', 'done']) assert.equal(typeof handover[k], 'string');
});

// The drift guard. Six sweeps once spelled six different subsets, and nothing compared
// them; the pack is small enough that the honest check is to read it and insist the
// checklist shape appears nowhere but its source. Tracked files only — an untracked
// working file is not what a member receives.
test('no file but fleet-token.mjs writes a grant list of its own', () => {
  const tracked = execFileSync('git', ['ls-files', 'packs/sheepdog'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => f !== 'packs/sheepdog/fleet-token.mjs');
  for (const rel of tracked) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.ok(!/Metadata\s+(read|\+)/i.test(text),
      `${rel} spells its own token grant — render it from fleet-token.mjs instead`);
  }
});
