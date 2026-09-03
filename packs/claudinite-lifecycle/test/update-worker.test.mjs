import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateBranchName, updatePullText, main } from '../tasks/update/worker.mjs';
import { NEEDS_HUMAN } from '../updates/engine-update.mjs';
import { removeTree } from '../../../engine/remove-tree.mjs';

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
    { engine: { from: 1, to: 2 }, packs: { plan: [{ id: 'basics', from: 1, to: 2 }, { id: 'claudinite-fleet-sheepdog', from: 3, to: 3 }] } },
  );
  assert.equal(title, 'Claudinite update: engine v1 → v2 and 1 pack upgraded');
  assert.ok(!title.includes('claudinite-fleet-sheepdog'), 'a pack that did not move is not news');
  assert.match(body, /- basics 1 → 2/, 'the per-pack detail lives in the body');
  assert.match(body.split('\n')[0], /needs-human/, 'the first line says which terminal fired');
  assert.match(body, /FAILED its self-test/);
  assert.match(body, /stays open/);
});

test('the title summarizes packs by count rather than naming every one', () => {
  const plan = [
    { id: 'basics', from: 5, to: 7 },
    { id: 'claudinite-lifecycle', from: 6, to: 8 },
    { id: 'git-github', from: 3, to: 4 },
    { id: 'claudinite-growth', from: 6, to: 7 },
    { id: 'tidy-repo', from: 4, to: 5 },
  ];
  const { title, body } = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: 4, to: 5 }, packs: { plan } });
  assert.equal(title, 'Claudinite update: engine v4 → v5 and 5 packs upgraded');
  for (const p of plan) assert.match(body, new RegExp(`- ${p.id} ${p.from} → ${p.to}`), 'every move is still in the body');
});

test('each half of the title appears only when that half moved', () => {
  const engineOnly = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: 4, to: 5 }, packs: { plan: [{ id: 'basics', from: 2, to: 2 }] } });
  assert.equal(engineOnly.title, 'Claudinite update: engine v4 → v5');
  const packsOnly = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: 5, to: 5 }, packs: { plan: [{ id: 'basics', from: 1, to: 2 }, { id: 'tidy-repo', from: 4, to: 5 }] } });
  assert.equal(packsOnly.title, 'Claudinite update: 2 packs upgraded');
});

test('the PR text says plainly when nothing moved', () => {
  const { title, body } = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: 2, to: 2 }, packs: { plan: [] } });
  assert.equal(title, 'Claudinite update');
  assert.match(body, /No version moved/);
});

test('an unstamped repo reads as unstamped, not as version zero', () => {
  const { title } = updatePullText({ action: 'merge', why: 'green' }, { engine: { from: null, to: 2 }, packs: { plan: [] } });
  assert.equal(title, 'Claudinite update: engine unstamped → v2');
});

test('the apply-stage body says the merge waits on the repair', () => {
  const { body } = updatePullText({ action: 'apply-stage', why: 'rules met member content' }, { engine: { from: 2, to: 2 }, packs: { plan: [] } });
  assert.match(body, /before anything merges/);
});

// THE MECHANISM QUESTION IS GONE (#1252). The runner used to refuse a repo declaring
// the retired `baselining` mechanism, because exactly one of two mechanisms served a
// mount and standing down quietly would leave that repo unmaintained with a green run
// to show for it. Phase 5 deleted the rival, so every member that could still ask had
// one possible answer, and the block that held the question came out with it.
//
// What replaces the guard is structural, and this is the part that CAN still be wrong:
// the runner is VENDORED, so the copy running on a member may predate the record that
// renamed that member's own settings file. Resolving the path through `settingsPath`
// is what makes it read either name; a literal here would report "nothing to update"
// on every repo that has not converged yet — quietly, which is the failure mode the
// old guard existed to prevent, arriving by a different door.
test('the runner resolves its settings file by name-tolerant lookup, never a literal', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8');
  assert.match(src, /settingsPath\(root\)/, 'the runner must resolve the settings file, not name it');
  assert.ok(!src.includes("'.claudinite-checks.json'") && !src.includes("'.claudinite-settings.json'"),
    'a literal settings-file name in the runner is a repo it will silently skip');
  assert.match(src, /deliveryFor\(declaration\)/, "delivery comes from the member's own settings");
});

test('the terminal vocabulary the runner acts on is the flows\' own', async () => {
  // A drift guard across the seam: the runner branches on `terminal.action`, and the
  // strings it branches on have to be the ones terminals.mjs can actually produce.
  const { TERMINALS } = await import('../updates/terminals.mjs');
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
  const { REHEARSAL_MARKER } = await import('../../../packs/claudinite-lifecycle/tasks/update/worker.mjs');
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
  const decl = (await import('../../../packs/claudinite-lifecycle/tasks/update/task.json', { with: { type: 'json' } })).default;

  // Merging must be within the ceiling, or the instruction below tells the session to
  // violate its own contract — verify-outcome.mjs would then fail every apply stage.
  assert.equal(decl.expected_outcome, 'pr');

  const land = brief.slice(brief.indexOf('## 5.'));
  assert.ok(land, 'the brief must still carry a §5');
  // The action moved into the shared procedure (a task.md describes the changes
  // to perform, never what happens to them — owner, 2026-08-30), so the property
  // pinned here is that the brief sends the session THERE, now, in this run.
  assert.match(land, /hand the PR to the shared\ndelivery procedure/i, 'the session must be told to act, not to wait');
  assert.match(land, /deliver-pr\.md/, 'and where the acting is spelled out');
  assert.match(land, /until you deliver it/i, 'nothing else lands an apply-stage PR — the delivery is this run\'s');
  assert.ok(!/maintenance\.delivery/.test(land), 'the settings mechanics stay in deliver-pr.md, not re-spelled here');

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

// #1545's second half. Holding an owing pack's stamp means a re-staging cycle can leave
// the tree CLEAN — the staged bytes already on the branch, no version line to rewrite —
// and the worker's "nothing changed" guard returns before the PR is opened. The
// apply-stage request is written after that PR, so the guard firing on an apply-stage
// terminal means nobody is ever asked to deliver the file: the same silent loss, one
// step further along. Only `merge` and `keep` may take the early exit.
test('the "nothing changed" guard never swallows an apply-stage terminal', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('packs/claudinite-lifecycle/tasks/update/worker.mjs', 'utf8');
  const guard = src.slice(src.indexOf("const changed = git("));
  const body = guard.slice(0, guard.indexOf('}') + 1);
  assert.match(body, /terminal\.action !== 'apply-stage'/,
    'an apply-stage terminal owes a delivery, so it must reach the PR that requests it');
  // And the request really does sit after the PR, which is what makes the guard fatal.
  assert.ok(src.indexOf("'agent-requested'") > src.indexOf('/repos/${repo}/pulls'),
    'if the request ever moves above PR creation, this guard stops being load-bearing');
});
