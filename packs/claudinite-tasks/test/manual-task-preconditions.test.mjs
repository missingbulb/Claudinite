import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { evaluatePrecondition, loadTaskTerms } from '../shared-code/preconditions.mjs';
import { loadTaskDeclaration } from '../task-declaration.mjs';
import { normalizeTaskDeclaration, isScheduledTask } from '../task-contract.mjs';

// It lives in this pack's own test/ because the semantics it pins are this pack's:
// a WOKEN-GATED task (`['woken', …]`, the spelling of the retired `frequency:
// manual`) is never asked by the scheduler run, the executor evaluates its
// precondition at pick over the item somebody created, and a no-go closes that item.
// Its SUBJECT spans every pack's tasks/, which is not a reason to sit in
// engine-tests/ — that tree mirrors engine/, and task-code-work-env.test.mjs beside
// this file already sweeps the same real tree.
//
// A woken-gated task's gate IS a human creating its work item. Nothing else can put
// one in the queue: the scheduler run asks nothing of it, so an item exists only
// because someone asked for this task to run — and the `woken` term is what says
// so, holding on that item and on nothing else.
//
// The executor evaluates the precondition at pick regardless (tasks-dispatch
// DESIGN §6.4/§8 — "even forced work is admitted by code"), and a no-go takes
// `noGoPlan`'s close branch: the item is CLOSED `task:status:rejected` without
// ever running. A lever whose other conditions cannot hold on a bare hand-created
// item is therefore a lever that cannot be pulled at all.
test('no woken-gated task refuses its own hand-created item, and none runs at the scheduler\'s ask', async () => {
  // `:(glob)` so `*` stops at a path separator: the subject is the `tasks/` slot a pack
  // CONTRIBUTES, not a built-in the queue ships under its own `queue/tasks/`, whose
  // precondition answers about the request issue its item names (tasks-dispatch DESIGN §16).
  const files = execFileSync('git', ['ls-files', ':(glob)packs/*/tasks/*/task.json'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(files.length, 'the task glob matched nothing — a layout change would make this test vacuous');

  const woken = [];
  for (const f of files) {
    const decl = normalizeTaskDeclaration(await loadTaskDeclaration(resolve(f)));
    if (decl && !isScheduledTask(decl)) woken.push({ f, decl });
  }
  assert.ok(woken.length, 'no woken-gated tasks found — this guard has lost its subject');

  for (const { f, decl } of woken) {
    // Through the executor's own seam, with the task's terms loaded the way
    // discovery loads them: a declaration whose gate lives beside it must be
    // evaluated with that gate, or every such task would read as broken here.
    const terms = await loadTaskTerms(dirname(resolve(f)));
    const created = evaluatePrecondition({ decl, terms }, {}, {}, { number: 1, woken: true });
    assert.equal(created.run, true,
      `${f} is woken-gated but its precondition answers run: ${JSON.stringify(created.run)} `
      + `(${created.reason ?? created.error ?? 'no reason'}) on the item somebody created for it. `
      + 'A woken-gated task only ever has an item because a human created one, and a no-go closes that item '
      + 'task:status:rejected without running — the lever is dead.');
    const asked = evaluatePrecondition({ decl, terms }, {}, {}, null);
    assert.equal(asked.run, false, `${f}: the scheduler's own ask must never hold — the task would be on the schedule`);
  }
});
