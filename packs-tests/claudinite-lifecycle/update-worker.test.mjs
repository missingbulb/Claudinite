import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateBranchName, updatePullText, main } from '../../packs/claudinite-lifecycle/tasks/update/worker.mjs';
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

test('the runner refuses a repo declaring the RETIRED mechanism, loudly', async () => {
  // The other half of the old skew guard, at the only place it can be wrong. Phase 5
  // deleted the mechanism this repo names, so it is served by NOTHING — and standing
  // down quietly would leave it unmaintained with a green run to show for it. Driven
  // through the real main() against a real directory, because what matters is that it
  // stops BEFORE the clone: a stubbed clone would prove nothing about it.
  const root = mkdtempSync(join(tmpdir(), 'claudinite-updskew-'));
  try {
    writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify({
      packs: ['basics'],
      maintenance: { delivery: 'auto-merge', mechanism: 'baselining' },
      claudinite: { updated: '2026-08-12T00:00:00Z', ref: 'abc123' },
    }, null, 2)}\n`);

    const said = [];
    const err = console.error;
    const exit = process.exit;
    const env = { ...process.env };
    process.env.CLAUDINITE_REPO_ROOT = root;
    process.env.CLAUDINITE_REPO = 'o/r';
    process.env.GITHUB_TOKEN = 'not-used-because-it-refuses-first';
    console.error = (...a) => said.push(a.join(' '));
    let code = null;
    process.exit = (c) => { code = c; throw new Error('exited'); };
    try { await main(); } catch (e) { if (e.message !== 'exited') throw e; }
    finally { console.error = err; process.exit = exit; process.env = env; }

    assert.equal(code, 1, 'a repo nothing maintains must fail its run, not pass quietly');
    assert.match(said.join('\n'), /retired in Claudinite #768 Phase 5/);
    assert.match(said.join('\n'), /Set it to "versioned"/, 'the refusal has to say what to do');
    assert.ok(!existsSync(join(root, '.git')), 'no branch, no clone, no write');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the terminal vocabulary the runner acts on is the flows\' own', async () => {
  // A drift guard across the seam: the runner branches on `terminal.action`, and the
  // strings it branches on have to be the ones terminals.mjs can actually produce.
  const { TERMINALS } = await import('../../updates/terminals.mjs');
  const src = await import('node:fs').then((fs) => fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8'));
  for (const action of ['merge', 'needs-human', 'apply-stage']) {
    assert.ok(TERMINALS.includes(action), `${action} is not a terminal the flows produce`);
    assert.ok(src.includes(`'${action}'`), `the runner never handles the ${action} terminal`);
  }
  assert.equal(NEEDS_HUMAN, 'needs-human', 'the label and the terminal are one string');
});

test('the runner disposes of an open update PR BEFORE it converges (#787)', async () => {
  // The defect this closes: disposal placed after the converge is unreachable on a
  // quiet cycle, because `nothing changed — no branch, no PR` returns first. So the
  // cycle that should have landed the stranded PR opened a duplicate instead.
  // Asserted structurally, on the one ordering that makes the promise keepable.
  const fs = await import('node:fs');
  const src = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8');

  const disposal = src.indexOf('disposeOpenPull(');
  const clone = src.indexOf("'clone', '--depth'");
  const quietReturn = src.indexOf('nothing changed — no branch, no PR');
  assert.ok(disposal > 0 && clone > 0 && quietReturn > 0, 'the three landmarks still exist');
  assert.ok(disposal < clone, 'disposal must precede the canon clone and the converge that follows it');
  assert.ok(disposal < quietReturn, 'a cycle with nothing to converge must still dispose of the incumbent');

  // And two of the three outcomes must END the cycle: treating either `kept` or
  // `merged` as "carry on" is what puts a second PR on top of a live one, or
  // re-delivers a diff that just landed. Counted between the disposal and the clone,
  // so a handler that stops branching still has to stop the run.
  const block = src.slice(disposal, clone);
  assert.equal((block.match(/\breturn;/g) ?? []).length, 2,
    'both cycle-ending outcomes must return before the converge begins');
  for (const outcome of ['kept', 'merged']) {
    assert.match(block, new RegExp(`disposal === '${outcome}'`), `the runner ignores the ${outcome} outcome`);
  }
});

test('the runner finds its incumbent by the same prefix it delivers on', async () => {
  // A prefix that drifted from the branch names would silently find nothing to
  // dispose of, which reads exactly like a healthy cycle.
  const fs = await import('node:fs');
  const src = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8');
  assert.match(src, /openDeliveredPull\(open\.json, UPDATE_PREFIX\)/);
  assert.ok(updateBranchName('2026-08-12', 'abc123').startsWith('claudinite/update'),
    'the delivered branch and the searched prefix are the same family');
});

test('rehearsal mode announces that it converged, and the gate greps for it', async () => {
  // The canary rehearsal is "the required final step of any core change" — and it
  // silently rehearsed NOTHING from the day the canary flipped to `updates` until
  // #768 Phase 5, because it drove a baselining worker that correctly stood down and
  // exited 0. A green exit code was the only evidence anyone checked.
  //
  // So the marker is the evidence, and this pins the three places that must agree:
  // the constant, the worker line that prints it, and the workflow step that fails
  // without it. Any of the three drifting alone puts the gate back to vacuous.
  const fs = await import('node:fs');
  const { REHEARSAL_MARKER } = await import('../../packs/claudinite-lifecycle/tasks/update/worker.mjs');
  const worker = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/canary-rehearsal.yml', 'utf8');

  assert.match(worker, /\$\{REHEARSAL_MARKER\}/, 'the worker must print the marker, not a copy of its text');
  assert.ok(workflow.includes(REHEARSAL_MARKER), `the gate does not grep for "${REHEARSAL_MARKER}"`);
  assert.match(workflow, /working-directory: packs\/claudinite-lifecycle\/tasks\/update/,
    'the gate must drive the update worker this ref ships');
  assert.ok(!workflow.includes('tasks/baselining'), 'the gate still points at the retired worker');

  // And a rehearsal must never deliver: no branch, no commit, no PR, no stamp.
  const rehearsalBlock = worker.slice(worker.indexOf('if (rehearsalRef) {'));
  const upToReturn = rehearsalBlock.slice(0, rehearsalBlock.indexOf('return;'));
  for (const forbidden of ['checkout', '-B', 'commit', 'push']) {
    assert.ok(!upToReturn.includes(`'${forbidden}'`) || forbidden === 'checkout',
      `a rehearsal must not ${forbidden} — it restores the tree and reports`);
  }
  assert.match(upToReturn, /clean', '-fd'/, 'the rehearsal must restore the tree it converged');
});

test('the apply-stage brief tells the session to LAND its own delivery, not to wait a cycle', async () => {
  // The gap this closes, found live on the canary (#649, 2026-08-14). The worker merges
  // only on a `merge` terminal; an `apply-stage` run never arms auto-merge, and the PR
  // body says as much. The brief used to end "push to the branch and let the PR land per
  // this repo's delivery setting" — but under `auto-merge` nothing had armed it, so the
  // session pushed and stopped, correctly, and the delivery waited for the NEXT cycle's
  // disposal. `update` is daily, so a workflow the session had already moved into
  // `.github/workflows/` on the branch sat off `main` for up to a day.
  //
  // That standing ~24h offset is the exact defect `landDelivery` was written to close for
  // the deterministic half; the apply stage reintroduced it on the agent side. Pinned as
  // prose because the session holds the credential and the engine cannot: the executor is
  // MCP-only and carries no repo token, so there is no code path here to assert instead.
  const fs = await import('node:fs');
  const brief = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/task.md', 'utf8');
  const decl = (await import('../../packs/claudinite-lifecycle/tasks/update/task.mjs')).default;

  // Merging must be within the ceiling, or the instruction below tells the session to
  // violate its own contract — verify-outcome.mjs would then fail every apply stage.
  assert.equal(decl.expected_outcome, 'merged-pr');

  const land = brief.slice(brief.indexOf('## 5.'));
  assert.ok(land, 'the brief must still carry a §5');
  assert.match(land, /land the delivery yourself/i, 'the session must be told to act, not to wait');
  assert.match(land, /maintenance\.delivery/, 'and to read the repo\'s own setting rather than assume one');
  assert.match(land, /auto-merge/, 'the setting that means "you merge it"');
  assert.match(land, /review/, 'and the setting that means "leave it for a human"');

  // The passive phrasing is the bug itself, not a stylistic preference: "let the PR land"
  // describes something no component does on an apply-stage terminal.
  assert.ok(!/let the PR land/i.test(brief),
    'the brief must not tell the session to "let the PR land" — nothing lands it on an apply-stage terminal');
});

test('the needs-human terminal exits NON-ZERO, so the work item does not close outcome:done', async () => {
  // #939's invisibility, pinned. A parked PR means the converge DELIVERED NOTHING,
  // but the runner returned normally, so the executor saw a clean code-work and closed
  // the item `outcome:done`. Every member's nightly update reported success for five
  // days while the whole fleet sat frozen on one canon ref. The executor's contract
  // is `if (!result.ok)` -> needs-human, so the exit code is the entire signal.
  const fs = await import('node:fs');
  const src = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8');
  // Anchored on the terminal-dispatch block specifically: the same comparison
  // appears earlier in the file, on paths that already exit non-zero.
  const dispatch = src.slice(src.indexOf('// The terminal, acted on.'));
  const branch = dispatch.slice(dispatch.indexOf("terminal.action === 'needs-human'"));
  const body = branch.slice(0, branch.indexOf("terminal.action === 'apply-stage'"));
  assert.match(body, /process\.exit(Code)?\s*=?\s*\(?1/,
    'the needs-human branch must exit non-zero — exiting 0 reports a converge that did not happen as success');
});
