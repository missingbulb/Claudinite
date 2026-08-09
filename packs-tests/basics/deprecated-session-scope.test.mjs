// The deprecation of the task-level `session_scope` (owner ruling, 2026-08-09): the
// executor scope belongs to the owning pack's reach. Advisory, because the field still
// routes correctly — this is migration pressure, not a breakage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../engine-tests/helpers.mjs';
import { buildContext } from '../../engine/checks/helpers/repo-context.mjs';
import rule from '../../packs/basics/deprecated-session-scope.mjs';

const TASK = 'packs/demo/tasks/demo-task/task.mjs';

const run = (files) => {
  const root = makeRepo({ changed: files });
  try { return rule.run(buildContext({ root, mode: 'all' })); } finally { cleanup(root); }
};

test('advisory, and inert on a repo without tasks', () => {
  // Blocking would break repos that are running correctly, which is not what a
  // deprecation is for.
  assert.equal(rule.severity, 'advisory');
  assert.deepEqual(run({ 'src/app.js': "const session_scope = 'fleet';\n" }), []);
});

test('flags a task that declares the deprecated field', () => {
  const out = run({ [TASK]: "export default {\n  id: 'demo-task',\n  session_scope: 'fleet',\n};\n" });
  assert.equal(out.length, 1);
  assert.equal(out[0].file, TASK);
  assert.match(out[0].what, /deprecated task-level "session_scope"/);
  // The fix has to name where the answer moved to, or it is just a complaint.
  assert.match(out[0].fix, /sessionScope/);
  assert.match(out[0].fix, /pack\.mjs/);
});

test('quiet on a task that already moved', () => {
  assert.deepEqual(run({ [TASK]: "export default { id: 'demo-task', agent_model: 'sonnet' };\n" }), []);
});

test('a task explaining where its scope comes from is the OUTCOME, not a violation', () => {
  // sheepdog's fleet-fit carries exactly this: a comment saying the reach is the
  // pack's. Flagging it would punish the migration the check is asking for, and the
  // author would "fix" it by deleting the explanation.
  assert.deepEqual(run({
    [TASK]: [
      '// WHERE THE FLEET REACH COMES FROM: not from here — the pack declares',
      "// `sessionScope: 'fleet'`, so no session_scope: 'fleet' lives in this file.",
      "export default { id: 'demo-task' };",
      '',
    ].join('\n'),
  }), []);
});

test('only a tasks/<name>/task.mjs is in scope', () => {
  // The engine's own modules discuss the field at length; they are not tasks.
  assert.deepEqual(run({ 'engine/scheduler/session-scope.mjs': "  session_scope: 'fleet',\n" }), []);
});
