import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPacks } from '../engine/pack_loader/pack-registry.mjs';
import { packRules } from '../engine/checks/run-active-pack-rules.mjs';

// packs/README.md's corpus tally quotes how many hardcoded checks the canon
// carries — a derived number that was hand-maintained and drifted badly (it
// read 41 while the runner listed 65, so the ratio it argues from was wrong by
// a third). The catalog is the single source of truth; this guard keeps the
// prose equal to it. `packRules` is the same assembly `--list` prints, so the
// tally can never disagree with the runner about what a rule is.
//
// Deliberately guards only the CHECK count. The prose-rule figures beside it
// are audit estimates from docs/conversion-inventory.md — nothing derives them,
// so the README marks them as a dated snapshot rather than pretending they are
// live, and no test can hold them honest.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = 'packs/README.md';
const TALLY = /\|\s*\*\*Hardcoded conformance checks\*\*\s*\|\s*\*\*(\d+)\*\*/;

test('the packs/ catalog tally equals the rule catalog the runner lists', async () => {
  const { packs } = await discoverPacks({ localRoot: ROOT });
  const actual = packRules(packs).length;

  const readme = readFileSync(join(ROOT, CATALOG), 'utf8');
  const m = TALLY.exec(readme);
  assert.ok(m, `${CATALOG} carries no parseable "Hardcoded conformance checks" tally — keep the bolded count in the corpus-tally table so this guard can read it`);
  assert.equal(
    Number(m[1]), actual,
    `${CATALOG} says ${m[1]} hardcoded checks; the catalog carries ${actual}. Update the tally (and the ratio it feeds) in the same change that adds or removes a rule.`
  );
});
