import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyPreferences, withPreferencesPack, PACK_ID, SET,
} from '../../../../packs/sheepdog/tasks/fleet-preferences/check-fleet-preferences.mjs';

// The preferences sweep's whole judgement is `classifyPreferences` plus the one edit —
// both pure, so every branch is exercised here without a network. This is the one
// sweep in the pack that WRITES to a member, and each test below pins one of the
// reasons it is safe to.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const classify = (over) => classifyPreferences({ config: { packs: [] }, wanted: 'o/fleet', vendored: true, ...over });
const entry = (config) => ({ packs: [{ id: PACK_ID, ...(config ? { config } : {}) }] });

test('the pack it declares is the pack that reads preferences into a session', () => {
  // The sweep names the pack as a string because it runs against another repo's tree
  // over the API — nothing of that member's mount is importable. That makes the name a
  // literal that can drift, so it is checked against the canon's own tree.
  const manifest = readFileSync(join(repoRoot, 'packs', PACK_ID, 'pack.mjs'), 'utf8');
  assert.match(manifest, new RegExp(`id: '${PACK_ID}'`));
});

test('a member already naming the fleet\'s store is read and left alone', () => {
  const v = classify({ config: entry({ repo: 'o/fleet' }) });
  assert.equal(v.state, SET);
  // Case is not identity for a GitHub repo path, so a differently-cased value is the
  // same store — rewriting it would be a commit a day, forever.
  assert.equal(classify({ config: entry({ repo: 'O/Fleet' }) }).state, SET);
  // A path the member chose is the member's business: the fleet is the authority on
  // WHICH REPO, not on where inside it.
  assert.equal(classify({ config: entry({ repo: 'o/fleet', path: 'people' }) }).state, SET);
});

test('a member without a store is writable, and says which case it was', () => {
  const missing = classify({});
  assert.equal(missing.state, 'writable');
  assert.match(missing.detail, /declares no preferences store/);

  // Declared but unusable is a repair, not an addition — and the summary says so,
  // because completing a half-configured entry is a different act from adding one.
  const half = classify({ config: entry({}) });
  assert.equal(half.state, 'writable');
  assert.match(half.detail, /with no usable store/);
  // A bare string entry is the same case: declared, no config to read.
  assert.equal(classify({ config: { packs: [PACK_ID] } }).state, 'writable');
});

test('a member naming a DIFFERENT store is reported, never overwritten', () => {
  const v = classify({ config: entry({ repo: 'o/somewhere-else' }) });
  assert.equal(v.state, 'elsewhere');
  assert.match(v.detail, /left alone/);
});

test('the mount gate outranks the write — a member is never handed a pack it does not have', () => {
  // A declared pack whose code is absent is a blocking `config` error there, and a
  // member's mount carries only what it declared as of its last converge. So this is a
  // WAIT: members converge nightly and are written the first run after the pack lands.
  const v = classify({ vendored: false });
  assert.equal(v.state, 'not-vendored');
  assert.match(v.detail, /blocking config error/);
  // …and it applies to the half-configured case too — completing an entry whose pack
  // is missing would trade one config error for another.
  assert.equal(classify({ vendored: false, config: entry({}) }).state, 'not-vendored');
  // But a member already naming the store is never gated: nothing is being written.
  assert.equal(classify({ vendored: false, config: entry({ repo: 'o/fleet' }) }).state, SET);
});

// --- the edit -----------------------------------------------------------------

const decl = (o) => `${JSON.stringify(o, null, 2)}\n`;

test('withPreferencesPack: declares the pack, keeps everything else, writes canonical settings', () => {
  const before = decl({ packs: ['basics'], maintenance: { delivery: 'auto-merge' } });
  const after = withPreferencesPack(before, 'o/fleet');
  const parsed = JSON.parse(after);
  assert.deepEqual(parsed.packs[0], 'basics', 'the packs already declared survive, in order');
  assert.deepEqual(parsed.packs[1], { id: PACK_ID, config: { repo: 'o/fleet' } });
  assert.deepEqual(parsed.maintenance, { delivery: 'auto-merge' });
  // 2-space with a trailing newline — the shape `--init` writes, because the file is
  // round-tripped through JSON rather than edited as text.
  assert.equal(after, decl(parsed));
  // Idempotent: running it again changes nothing at all.
  assert.equal(withPreferencesPack(after, 'o/fleet'), after);
});

test('withPreferencesPack: completes an existing entry in place, keeping what it already carries', () => {
  const before = decl({ packs: ['basics', { id: PACK_ID, config: { path: 'team' }, answers: { store: 'n/a' } }] });
  const parsed = JSON.parse(withPreferencesPack(before, 'o/fleet'));
  assert.equal(parsed.packs.length, 2, 'the entry is completed, never duplicated');
  assert.deepEqual(parsed.packs[1], {
    id: PACK_ID, config: { path: 'team', repo: 'o/fleet' }, answers: { store: 'n/a' },
  }, 'its position, its path and its recorded answer all survive');
  // A bare string declaration becomes an entry object carrying the store.
  const fromString = JSON.parse(withPreferencesPack(decl({ packs: [PACK_ID] }), 'o/fleet'));
  assert.deepEqual(fromString.packs, [{ id: PACK_ID, config: { repo: 'o/fleet' } }]);
});

test('withPreferencesPack: refuses a declaration that is not a settings object', () => {
  for (const bad of ['[]', 'null', '"text"']) {
    assert.throws(() => withPreferencesPack(bad, 'o/fleet'), /not a JSON object/, bad);
  }
  assert.throws(() => withPreferencesPack('{oops', 'o/fleet'));
});
