import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// A `manual` task's gate IS a human creating its work item. Nothing else can put
// one in the queue: the tick skips `frequency: 'manual'` outright, so an item
// exists only because someone asked for this task to run.
//
// The executor evaluates the precondition at pick regardless (tasks-dispatch
// DESIGN §6.4/§8 — "even forced work is admitted by code"), and for a manual task
// there is no anchor to roll to, so a no-go takes `noGoPlan`'s close branch: the
// item is CLOSED `outcome:obsolete` without ever running.
//
// These preconditions were written under the slot mechanism, where a forced run
// BYPASSED the precondition entirely ("a forced run bypasses it by design") and
// the declared verdict was consulted by nothing. The queue reversed that
// deliberately, which silently turned every such lever into a task that cannot be
// run at all — `claudinite-fleet-sheepdog/fleet-baseline`, the fleet's converge lever, among them.
test('no manual task refuses its own forced item', async () => {
  const files = execFileSync('git', ['ls-files', 'packs/*/tasks/*/task.mjs'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(files.length, 'the task glob matched nothing — a layout change would make this test vacuous');

  const manual = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(resolve(f)).href);
    const decl = mod.default ?? mod.task ?? mod;
    if (decl?.frequency === 'manual') manual.push({ f, decl });
  }
  assert.ok(manual.length, 'no manual tasks found — this guard has lost its subject');

  for (const { f, decl } of manual) {
    const verdict = decl.precondition?.({}, {}) ?? {};
    assert.equal(verdict.run, true,
      `${f} declares frequency: 'manual' but its precondition answers run: ${JSON.stringify(verdict.run)} `
      + `(${verdict.reason ?? 'no reason'}). A manual task only ever has an item because a human created one, `
      + `and a no-go closes that item outcome:obsolete without running — the lever is dead.`);
  }
});
