import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { loadPacks } from '../../../engine/pack_loader/pack-registry.mjs';
import rule from '../worldRules/executor-workflow-secrets.mjs';

const EXECUTOR = '.github/workflows/claudinite-executor.yml';
const PACK = '.claudinite/local/packs/mypack';

const settings = (endpoints = null) => `${JSON.stringify({
  packs: ['local/mypack', 'claudinite-tasks'],
  ...(endpoints ? { taskScheduler: { agenticTaskInvocationEndpoints: endpoints } } : {}),
}, null, 2)}\n`;

const taskJson = (over = {}) => `${JSON.stringify({
  id: 'alpha', description: 'A task.', frequency: 'daily', expected_outcome: 'no_code_changes',
  code_work: 'node worker.mjs', code_work_timeout: 60, ...over,
}, null, 2)}\n`;

// The executor's shape reduced to what this rule reads: the marker, and whatever
// lines were stamped beneath it.
const executor = (...names) => [
  'jobs:', '  execute:', '    steps:', '      - name: Pick up and execute ready work', '        env:',
  '          GITHUB_TOKEN: ${{ github.token }}',
  '          # claudinite:secrets',
  ...names.map((n) => `          ${n}: \${{ secrets.${n} }}`),
  '        run: node packs/claudinite-tasks/queue/executor.mjs', '',
].join('\n');

const ENDPOINT = { default: { url: 'https://x.invalid/fire', tokenSecret: 'CCR_ROUTINE_TOKEN' } };

async function run(files) {
  const root = makeRepo({ changed: { [`${PACK}/pack.mjs`]: "export default { id: 'mypack' };\n", ...files } });
  try {
    const ctx = buildContext({ root, mode: 'all' });
    ctx.packs = await loadPacks({ localRoot: root });
    return rule.run(ctx);
  } finally { cleanup(root); }
}
const whatsOf = (findings) => findings.map((f) => f.what).join(' | ');

test('executor-workflow-secrets: silent when the executor passes every declared secret', async () => {
  assert.deepEqual(await run({
    '.claudinite-settings.json': settings(ENDPOINT),
    [`${PACK}/tasks/alpha/task.json`]: taskJson({ code_work_required_secrets: ['ALPHA_KEY'] }),
    [EXECUTOR]: executor('ALPHA_KEY', 'CCR_ROUTINE_TOKEN'),
  }), []);
});

test('executor-workflow-secrets: names the endpoint token the executor does not pass', async () => {
  const findings = await run({
    '.claudinite-settings.json': settings(ENDPOINT),
    [`${PACK}/tasks/alpha/task.json`]: taskJson({ code_work_required_secrets: ['ALPHA_KEY'] }),
    [EXECUTOR]: executor('ALPHA_KEY'),
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, EXECUTOR);
  assert.match(findings[0].what, /does not pass CCR_ROUTINE_TOKEN/);
  // Anchored at the marker, the line the missing entry belongs beneath.
  assert.equal(findings[0].line, 7);
  assert.match(findings[0].fix, /CCR_ROUTINE_TOKEN: \$\{\{ secrets\.CCR_ROUTINE_TOKEN \}\}/);
});

test('executor-workflow-secrets: a task\'s declared secret is expected too, retired spelling included', async () => {
  const missing = async (over) => whatsOf(await run({
    '.claudinite-settings.json': settings(),
    [`${PACK}/tasks/alpha/task.json`]: taskJson(over),
    [EXECUTOR]: executor(),
  }));
  assert.match(await missing({ code_work_required_secrets: ['ALPHA_KEY'] }), /does not pass ALPHA_KEY/);
  // `required_secrets` is the door's legacy name for the same field (task-contract.mjs),
  // so a member still spelling it that way is held to the same list.
  assert.match(await missing({ required_secrets: ['ALPHA_KEY'] }), /does not pass ALPHA_KEY/);
});

test('executor-workflow-secrets: an absent executor is the same failure, said as itself', async () => {
  const findings = await run({
    '.claudinite-settings.json': settings(ENDPOINT),
    [`${PACK}/tasks/alpha/task.json`]: taskJson(),
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].what, /is missing, so nothing passes CCR_ROUTINE_TOKEN/);
  assert.equal(findings[0].line, null);
});

test('executor-workflow-secrets: inert when nothing declares a secret, and blind to extra ones', async () => {
  // Nothing to deliver — an executor with an empty list is correct.
  assert.deepEqual(await run({
    '.claudinite-settings.json': settings(),
    [`${PACK}/tasks/alpha/task.json`]: taskJson(),
    [EXECUTOR]: executor(),
  }), []);
  // A member that dropped a task keeps a harmless line; only a MISSING name is a finding.
  assert.deepEqual(await run({
    '.claudinite-settings.json': settings(ENDPOINT),
    [`${PACK}/tasks/alpha/task.json`]: taskJson(),
    [EXECUTOR]: executor('CCR_ROUTINE_TOKEN', 'LONG_GONE_KEY'),
  }), []);
});

test('executor-workflow-secrets: an undeclared pack\'s task asks for nothing', async () => {
  assert.deepEqual(await run({
    '.claudinite-settings.json': `${JSON.stringify({ packs: ['claudinite-tasks'] }, null, 2)}\n`,
    [`${PACK}/tasks/alpha/task.json`]: taskJson({ code_work_required_secrets: ['ALPHA_KEY'] }),
    [EXECUTOR]: executor(),
  }), []);
});
