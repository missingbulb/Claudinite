import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import updateJson from '../tasks/update/task.json' with { type: 'json' };
import { normalizeTaskDeclaration } from '../../claudinite-tasks/task-contract.mjs';
// The loader's door: the JSON says what is particular to the task, the defaults are the contract's.
const update = normalizeTaskDeclaration(updateJson);

const TASK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../packs/claudinite-lifecycle/tasks/update');

// The baseline scheduled task every repo runs. This file tested `baselining` until
// #768 Phase 5 retired it; `update` is the successor in the same slot.
//
// The precondition itself — daily, with no repo-side gate, because the input this
// task asks about is the CANON, never local movement (task-preconditions DESIGN,
// #1344) — is a plain built-in declaration with no task-local term, so its
// mechanism is the scheduler's own suite to prove, not this pack's.

test('update: the worker and the worker doc the declaration names exist', () => {
  assert.ok(existsSync(join(TASK_DIR, 'worker.mjs')), 'the deterministic update worker must exist');
  assert.ok(existsSync(join(TASK_DIR, update.agent_instructions)), `worker doc missing: ${update.agent_instructions}`);
});
