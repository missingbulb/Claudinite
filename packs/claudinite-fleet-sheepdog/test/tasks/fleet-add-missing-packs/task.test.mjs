import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import declJson from '../../../tasks/fleet-add-missing-packs/task.json' with { type: 'json' };
import { parseParams } from '../../../tasks/fleet-add-missing-packs/params.mjs';
import { normalizeTaskDeclaration } from '../../../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const decl = normalizeTaskDeclaration(declJson);

// The claudinite-fleet-sheepdog pack's fleet-add-missing-packs task on the FAN-OUT model (#749):
// the enforcer dispatches, the member executes. Everything asserted here is a
// property that, if it drifted, would either stop the task running at all or
// bring back the enforcer-side agent that failed in production.

const taskDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../../packs/claudinite-fleet-sheepdog/tasks/fleet-add-missing-packs');

test('fleet-add-missing-packs: the declaration names its own directory and a worker that is there', () => {
  // discover.mjs resolves a task by its directory, and the executor runs code_work from it.
  assert.equal(decl.id, basename(taskDir));
  const [, script] = decl.code_work.split(/\s+/);
  assert.ok(existsSync(join(taskDir, script)), `code_work names ${script}, which is not beside the declaration`);
});

test('fleet-add-missing-packs: the declared code_work asks for the whole-fleet scan, and no default fills in', () => {
  // params.mjs has no defaults, so what the cadence does is exactly what the
  // declaration's argv says — parsed here by the real parser the worker uses.
  const [, , ...argv] = decl.code_work.split(/\s+/);
  const p = parseParams({ argv });
  assert.equal(p.scan, true);
  assert.equal(p.allMembers, true, 'the weekly run reads every covered member, by keyword');
  assert.equal(p.forced, false, 'and reports itself as the sweep, not a force');
});
