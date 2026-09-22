import { test } from 'node:test';
import assert from 'node:assert/strict';
import declJson from '../../../tasks/fleet-add-missing-packs/task.json' with { type: 'json' };
import { parseParams } from '../../../tasks/fleet-add-missing-packs/params.mjs';
import { SCHEDULED_ARGV } from '../../../tasks/fleet-add-missing-packs/worker.mjs';
import { normalizeTaskDeclaration } from '../../../../claudinite-tasks/public/task-declaration.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const decl = normalizeTaskDeclaration(declJson);

// The claudinite-fleet-sheepdog pack's fleet-add-missing-packs task on the FAN-OUT model (#749):
// the enforcer dispatches, the member executes. Everything asserted here is a
// property that, if it drifted, would either stop the task running at all or
// bring back the enforcer-side agent that failed in production.

test('fleet-add-missing-packs: the scheduled run asks for the whole-fleet scan, and no default fills in', () => {
  // params.mjs has no defaults, so what the cadence does is exactly what the worker's
  // own SCHEDULED_ARGV says — parsed here by the real parser the worker uses.
  const p = parseParams({ argv: SCHEDULED_ARGV });
  assert.equal(p.scan, true);
  assert.equal(p.allMembers, true, 'the weekly run reads every covered member, by keyword');
  assert.equal(p.forced, false, 'and reports itself as the sweep, not a force');
});
