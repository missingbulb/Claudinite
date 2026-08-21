import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, PACK_DIRECTORY_FILE } from '../engine/pack_loader/pack-registry.mjs';

// packs/directory.GENERATED.md is the full catalog of adoptable packs, vendored
// into every consumer's mount regardless of declaration (compute-vendor-set
// includes it unconditionally) so a member session can see what it could add,
// not just what it already runs. The manifests are the single source of truth;
// this test renders the catalog from them and maintains the committed artifact:
// locally it regenerates the file into the working tree (deterministic — no
// timestamps, so an up-to-date run yields no diff), under CI it only asserts,
// so a pack change that forgets to regenerate fails there with the fix named.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Escape a manifest string for a table cell: it must stay on the row's one line
// and must not open a new column.
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

// How a pack comes to be active, from the same manifest fields bootstrap's
// --init reads: seeding, a fingerprint marker, or plain declaration. A pack can
// be both seeded and fingerprinted; a pack with neither is opt-in by hand.
function activation(pack) {
  const parts = [];
  if (pack.seededByDefault) parts.push('seeded by bootstrap `--init`');
  if (pack.marker) parts.push(`fingerprinted: ${cell(pack.marker)}`);
  return parts.length ? parts.join('; ') : 'declared by hand (opt-in)';
}

// The catalog is what the corpus OFFERS, not everything it holds: a `hidden`
// pack (pack-schema.mjs) is left out of it entirely, so no session routes a
// lesson to it or suggests adopting it. It stays declarable by hand.
export function renderPackDirectory(packs) {
  const rows = [...packs]
    .filter((p) => !p.hidden)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `| \`${p.id}\` | ${cell(p.ruleRoutingGuidance?.belongs ?? '')} | ${cell(p.ruleRoutingGuidance?.excludes ?? '')} | ${activation(p)} | ${p.requires?.length ? p.requires.map((r) => `\`${r}\``).join(', ') : '—'} |`);
  return `# Claudinite packs — the full directory

Every pack this repo can adopt from Claudinite, whether or not it is declared here yet. A pack
activates only when declared in \`.claudinite-checks.json\`; adding one is the \`adopt-pack\`
skill's job (declare, interview, re-vendor, scaffold). A fingerprint marker only *suspects* a
pack is wanted — declaring it is always the project's call.

GENERATED — do not hand-edit. Rendered from the pack manifests by the canon's
\`engine-tests/pack-directory.test.mjs\`; regenerate by running that test in a canon checkout.

| Pack | What it covers | Not this pack | Activation | Requires |
|---|---|---|---|---|
${rows.join('\n')}
`;
}

test('packs/directory.GENERATED.md is current with the pack manifests', async () => {
  const packs = await loadPacks(); // canon packs only — the catalog a repo adopts FROM
  assert.ok(packs.length > 0, 'pack discovery found nothing — the catalog would be empty');

  const rendered = renderPackDirectory(packs);
  for (const p of packs) {
    if (p.hidden) {
      assert.doesNotMatch(rendered, new RegExp(`^\\| \`${p.id}\` \\|`, 'm'), `hidden pack "${p.id}" is rendered into the catalog`);
      continue;
    }
    assert.match(rendered, new RegExp(`^\\| \`${p.id}\` \\|`, 'm'), `no row rendered for pack "${p.id}"`);
  }

  const path = join(ROOT, PACK_DIRECTORY_FILE);
  if (!process.env.CI && (!existsSync(path) || readFileSync(path, 'utf8') !== rendered)) {
    writeFileSync(path, rendered);
  }
  assert.ok(existsSync(path), `${PACK_DIRECTORY_FILE} is missing — run this test locally (it regenerates the file) and commit the result`);
  assert.equal(
    readFileSync(path, 'utf8'), rendered,
    `${PACK_DIRECTORY_FILE} is stale against the pack manifests — run this test locally (it regenerates the file) and commit the result in the same change that touched the packs`
  );
});

// A hidden pack is content the corpus carries but does not offer: it loads,
// runs and stays declarable by hand, and the catalog simply never names it.
// Asserted against a synthetic manifest as well as the real tree, so the rule
// keeps its teeth in a corpus where nothing happens to be hidden.
test('renderPackDirectory omits a hidden pack', () => {
  const pack = (id, extra) => ({ id, ruleRoutingGuidance: { belongs: `${id} belongs`, excludes: `${id} excludes` }, ...extra });
  const rendered = renderPackDirectory([pack('visible-pack'), pack('hidden-pack', { hidden: true })]);
  assert.match(rendered, /^\| `visible-pack` \|/m);
  assert.doesNotMatch(rendered, /hidden-pack/);
});
