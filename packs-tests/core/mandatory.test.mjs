import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../engine/checks/helpers/work.mjs';
import { discoverPacks, resolveDeclaredPacks, packEntryId } from '../../engine/pack_loader/pack-registry.mjs';
import basicsPack from '../../packs/basics/pack.mjs';
import corePack from '../../packs/core/pack.mjs';
import coreDeclared from '../../packs/core/core-declared.mjs';

// `core` is mandatory in every Claudinite member. Nothing in a single module can
// assert that on its own — it is three facts in three places, and this file holds
// all three together so none of them can move without the others:
//
//   1. the requires EDGE that makes core reach every member (basics -> core),
//   2. the CLOSURE actually materializing the declaration from that edge, and
//   3. the CHECK that reports a member whose declaration lacks it.
//
// The check itself spells `core` as a literal, because a rule's `run` is
// synchronous and reading a manifest is a dynamic import. Case 1 is the drift
// guard for that literal.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('basics requires core — the edge that makes it mandatory', () => {
  assert.ok(
    basicsPack.requires?.includes('core'),
    'basics must require core: it is the pack seeded everywhere, so its requires closure is what carries core into every member. Without this edge nothing declares core and packs/core/core-declared.mjs guards a literal that means nothing.',
  );
});

test('the requires closure materializes core into a declaration that names only basics', async () => {
  const { packs } = await discoverPacks({ localRoot: REPO });
  const resolved = resolveDeclaredPacks(['basics'], packs).map(packEntryId);
  assert.ok(resolved.includes('core'), `resolving ["basics"] gave ${JSON.stringify(resolved)} — core must be in the closure`);
});

test('core-declared: silent on a member that declares core, fires on one that does not', () => {
  const withCore = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: ['core', 'basics'] }) } });
  const without = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }) } });
  try {
    assert.equal(runRule(coreDeclared, buildContext({ root: withCore, mode: 'all' })).length, 0);
    const findings = runRule(coreDeclared, buildContext({ root: without, mode: 'all' }));
    assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
    assert.equal(findings[0].file, '.claudinite-checks.json');
    assert.match(findings[0].what, /core/);
  } finally { cleanup(withCore); cleanup(without); }
});

test('core-declared: an entry-object declaration counts, and a non-member is inert', () => {
  const objectEntry = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: [{ id: 'core', via: ['basics'] }] }) } });
  const notAMember = makeRepo({ changed: { 'README.md': '# hi\n' } });
  try {
    assert.equal(runRule(coreDeclared, buildContext({ root: objectEntry, mode: 'all' })).length, 0);
    assert.equal(runRule(coreDeclared, buildContext({ root: notAMember, mode: 'all' })).length, 0);
  } finally { cleanup(objectEntry); cleanup(notAMember); }
});

test('the canon home declares core itself — baselining never reaches it', () => {
  // The nightly backfill that seeds a pack across the fleet is gated `!isHome`, so
  // this repo's own declaration is the one nothing delivers to. If it drifts, every
  // core rule stops running in the repo that authors them.
  const config = JSON.parse(readFileSync(join(REPO, '.claudinite-checks.json'), 'utf8'));
  assert.ok(config.packs.map(packEntryId).includes('core'), 'the canon home must declare core in its own .claudinite-checks.json');
});

test('the core-seed record declares exactly the pack this manifest ships', async () => {
  const { default: record } = await import('../../packs/core/migrations/2026-08-14-core-seed/migration.mjs');
  assert.deepEqual(record.declarePacks.map((p) => p.id), [corePack.id]);
  assert.ok(record.version <= corePack.version, `the record declares version ${record.version}; the pack ships ${corePack.version} — a record above its pack's version re-applies every cycle forever`);
});
