import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateBranchName, updatePullText, main } from '../../packs/basics/tasks/update/worker.mjs';
import { NEEDS_HUMAN } from '../../updates/engine-update.mjs';

// The update runner's git-free surface. Its clone/push/PR half is validated by the
// live pilot, exactly as baselining's is — what is unit-testable is the naming, the
// text a human reads when a run stops, and the stand-down that decides whether any
// of it happens at all.

test('a branch carries its date and a seed, so two runs on one day cannot collide', () => {
  const a = updateBranchName('2026-08-12', 'abc123');
  const b = updateBranchName('2026-08-12', 'def456');
  assert.equal(a, 'claudinite/update-2026-08-12-abc123');
  assert.notEqual(a, b);
  assert.match(a, /2026-08-12/, 'a name a human can read a week later');
});

test('the PR text leads with the terminal, then what moved', () => {
  const { title, body } = updatePullText(
    { action: 'needs-human', why: 'the converged tree FAILED its self-test' },
    { engine: { from: 1, to: 2 }, packs: { plan: [{ id: 'basics', from: 1, to: 2 }, { id: 'sheepdog', from: 3, to: 3 }] } },
  );
  assert.match(title, /engine 1 → 2/);
  assert.match(title, /basics 1 → 2/);
  assert.ok(!title.includes('sheepdog'), 'a pack that did not move is not news');
  assert.match(body.split('\n')[0], /needs-human/, 'the first line says which terminal fired');
  assert.match(body, /FAILED its self-test/);
  assert.match(body, /stays open/);
});

test('the PR text says plainly when nothing moved', () => {
  const { title, body } = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: 2, to: 2 }, packs: { plan: [] } });
  assert.equal(title, 'Claudinite update');
  assert.match(body, /No version moved/);
});

test('an unstamped repo reads as unstamped, not as version zero', () => {
  const { title } = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: null, to: 2 }, packs: { plan: [] } });
  assert.match(title, /engine unstamped → 2/);
});

test('the apply-stage body says the merge waits on the repair', () => {
  const { body } = updatePullText({ action: 'apply-stage', why: 'rules met member content' }, { engine: { from: 2, to: 2 }, packs: { plan: [] } });
  assert.match(body, /before anything merges/);
});

test('the runner stands down for a repo baselining serves', async () => {
  // The other half of the skew guard, at the only place it can be wrong. Driven
  // through the real main() against a real directory, because what matters is that
  // it stands down BEFORE the clone — a stubbed clone would prove nothing about it.
  const root = mkdtempSync(join(tmpdir(), 'claudinite-updskew-'));
  try {
    writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify({
      packs: ['basics'],
      maintenance: { delivery: 'auto-merge' },     // no mechanism → baselining, the status quo
      claudinite: { updated: '2026-08-12T00:00:00Z', ref: 'abc123' },
    }, null, 2)}\n`);

    const said = [];
    const log = console.log;
    const env = { ...process.env };
    process.env.CLAUDINITE_REPO_ROOT = root;
    process.env.CLAUDINITE_REPO = 'o/r';
    process.env.GITHUB_TOKEN = 'not-used-because-it-stands-down-first';
    console.log = (...a) => said.push(a.join(' '));
    try { await main(); } finally { console.log = log; process.env = env; }

    assert.match(said.join('\n'), /served by baselining — standing down/);
    assert.ok(!existsSync(join(root, '.git')), 'no branch, no clone, no write');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the terminal vocabulary the runner acts on is the flows\' own', async () => {
  // A drift guard across the seam: the runner branches on `terminal.action`, and the
  // strings it branches on have to be the ones terminals.mjs can actually produce.
  const { TERMINALS } = await import('../../updates/terminals.mjs');
  const src = await import('node:fs').then((fs) => fs.readFileSync('packs/basics/tasks/update/worker.mjs', 'utf8'));
  for (const action of ['merge', 'needs-human', 'apply-stage']) {
    assert.ok(TERMINALS.includes(action), `${action} is not a terminal the flows produce`);
    assert.ok(src.includes(`'${action}'`), `the runner never handles the ${action} terminal`);
  }
  assert.equal(NEEDS_HUMAN, 'needs-human', 'the label and the terminal are one string');
});
