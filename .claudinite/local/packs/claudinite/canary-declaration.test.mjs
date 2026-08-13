import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The canary binding lives in the TRACKED declaration, on the local/claudinite
// pack entry's `config.canaryRepo` — the same pack-entry config mechanism the
// sheepdog pack uses for its fleet scope.
//
// It is deliberately NOT a GitHub repository variable. A variable is invisible in
// the tree, absent from every diff, and cannot be reviewed beside the workflow
// that acts on it — and this particular value names a repo that CI will check out
// and rewrite. A reader of this repo should be able to see which one.
//
// These two facts have to stay in step: the declaration must name a canary, and
// the workflow must read it from there. Nothing else couples them, so without this
// guard the workflow could drift back to a variable (or to a hardcoded name) and
// the declared value would sit there looking authoritative while meaning nothing.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOW = '.github/workflows/canary-rehearsal.yml';

const declaration = () => JSON.parse(readFileSync(join(ROOT, '.claudinite-checks.json'), 'utf8'));
const workflow = () => readFileSync(join(ROOT, WORKFLOW), 'utf8');

test('the canary is declared on the local/claudinite pack entry, in owner/name form', () => {
  const entry = (declaration().packs ?? []).find((p) => p && p.id === 'local/claudinite');
  assert.ok(entry, 'the canon does not declare local/claudinite as an object entry');
  const repo = entry.config?.canaryRepo;
  assert.ok(repo, 'local/claudinite declares no config.canaryRepo — the canary rehearsal has nothing to converge');
  assert.match(repo, /^[\w.-]+\/[\w.-]+$/, `canaryRepo "${repo}" is not <owner>/<name>`);
});

test('the workflow reads the canary from the declaration, not from a repository variable', () => {
  const text = workflow();
  assert.match(text, /\.claudinite-checks\.json/, 'the workflow no longer reads the declaration');
  assert.match(text, /canaryRepo/, 'the workflow no longer reads config.canaryRepo');
  assert.doesNotMatch(text, /vars\.CLAUDINITE_CANARY_REPO/,
    'the workflow reads a repository variable again — the binding belongs in the tracked declaration');
});

// A hardcoded name would work and be exactly as unreviewable as the variable was:
// the declaration would still look authoritative while the workflow ignored it.
test('the workflow does not hardcode the canary name', () => {
  const entry = (declaration().packs ?? []).find((p) => p && p.id === 'local/claudinite');
  const repo = entry.config.canaryRepo;
  const body = workflow().split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.ok(!body.includes(repo), `${WORKFLOW} names ${repo} literally — it must resolve it from the declaration`);
});
