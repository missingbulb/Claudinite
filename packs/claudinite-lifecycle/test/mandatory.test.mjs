import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import { discoverPacks, resolveDeclaredPacks, packEntryId } from '../../../engine/pack_loader/pack-registry.mjs';
import { loadDeclaredChecks } from '../../../engine/checks/helpers/pattern-rules.mjs';
import corePack from '../pack.mjs';

const coreDeclared = loadDeclaredChecks(
  fileURLToPath(new URL('../../../packs/claudinite-lifecycle', import.meta.url)),
).find((r) => r.id === 'claudinite-lifecycle-declared');

// `core` is mandatory in every Claudinite member. Nothing in a single module can
// assert that on its own — it is three facts in three places, and this file holds
// all three together so none of them can move without the others:
//
//   1. the requires EDGE that makes core reach every member (basics -> core),
//   2. the CLOSURE actually materializing the declaration from that edge, and
//   3. the CHECK that reports a member whose declaration lacks it.
//
// The check (a declared check in packs/claudinite-lifecycle/declared-checks.json) spells `core`
// as a literal; case 1 is the drift guard for that literal. It reads the RAW
// packs array, so an entry object must count by its id — and it reports, never
// rescues: activation reads the literal declaration, so in a repo missing the
// entry the rule itself does not run. The entry arrives two other ways (the
// requires closure on every declaration write, the core-seed record), which is
// why the check only has to catch a hand-deleted entry.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the requires closure materializes core into a declaration that names only basics', async () => {
  const { packs } = await discoverPacks({ localRoot: REPO });
  const resolved = resolveDeclaredPacks(['basics'], packs).map(packEntryId);
  assert.ok(resolved.includes('claudinite-lifecycle'), `resolving ["basics"] gave ${JSON.stringify(resolved)} — core must be in the closure`);
});

test('claudinite-lifecycle-declared: silent on a member that declares core, fires on one that does not', () => {
  const withCore = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['claudinite-lifecycle', 'basics'] }) } });
  const without = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) } });
  try {
    assert.equal(runRule(coreDeclared, buildContext({ root: withCore, mode: 'all' })).length, 0);
    const findings = runRule(coreDeclared, buildContext({ root: without, mode: 'all' }));
    assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
    assert.equal(findings[0].file, '.claudinite-settings.json');
    assert.match(findings[0].what, /claudinite-lifecycle/);
  } finally { cleanup(withCore); cleanup(without); }
});

test('claudinite-lifecycle-declared: an entry-object declaration counts, and a non-member is inert', () => {
  const objectEntry = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: [{ id: 'claudinite-lifecycle', via: ['basics'] }] }) } });
  const notAMember = makeRepo({ changed: { 'README.md': '# hi\n' } });
  try {
    assert.equal(runRule(coreDeclared, buildContext({ root: objectEntry, mode: 'all' })).length, 0);
    assert.equal(runRule(coreDeclared, buildContext({ root: notAMember, mode: 'all' })).length, 0);
  } finally { cleanup(objectEntry); cleanup(notAMember); }
});

test('the canon home passes its own claudinite-lifecycle-declared check — baselining never reaches it', () => {
  // The nightly backfill that seeds a pack across the fleet is gated `!isHome`, so
  // this repo's own declaration is the one nothing delivers to. If it drifts, every
  // core rule stops running in the repo that authors them.
  assert.deepEqual(runRule(coreDeclared, buildContext({ root: REPO, mode: 'all' })), []);
});

test('the core-seed record never outruns the version this manifest ships', async () => {
  const { default: record } = await import('../../../packs/claudinite-lifecycle/migrations/2026-08-14-core-seed/migration.mjs');
  assert.ok(record.version <= corePack.version, `the record declares version ${record.version}; the pack ships ${corePack.version} — a record above its pack's version re-applies every cycle forever`);
});
