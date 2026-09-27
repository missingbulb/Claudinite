import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../../../engine/checks/helpers/work.mjs';
import rule from '../workRules/call-hook-latency-measured.mjs';

// The two halves have to arrive together: the paths name the real per-call hooks
// because those paths ARE the rule's subject, and the measurement is evidence the
// session left in its own transcript rather than anything the tree can show.
const JUDGE = 'engine/hooks/pretooluse-judge.mjs';
const RUNNER = 'engine/hooks/hook-runner.mjs';
const bash = (command) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });

// `entries: null` stands for the run that carries no transcript at all - CI.
function judge(changed, entries) {
  const root = makeRepo({ base: { 'engine/hooks/.keep': '' }, changed });
  const session = entries === null ? null : makeTranscript(entries);
  try {
    const ctx = buildContext({ root, mode: 'all', ...(session ? { transcriptPath: session.path } : {}) });
    return runRule(rule, ctx).map((f) => f.file);
  } finally { cleanup(root); session?.cleanup(); }
}

test('a per-call hook changed with no hook-latency run in the session is flagged, at that file', () => {
  assert.deepEqual(judge({ [JUDGE]: '// edited\n' }, [bash('node --test engine-tests/hooks.test.mjs')]), [JUDGE]);
  assert.deepEqual(
    judge({ [RUNNER]: '// edited\n' }, [bash('git diff')]), [RUNNER],
    'the runner is a per-call hook too, not only the judges'
  );
});

test('a hook-latency run anywhere in the session clears it', () => {
  assert.deepEqual(judge({ [JUDGE]: '// edited\n' }, [bash('node dev/tools/hook-latency.mjs . - 10')]), []);
  assert.deepEqual(
    judge({ [JUDGE]: '// edited\n' }, [bash('node dev/tools/hook-latency.mjs'), bash('node dev/tools/hook-latency.mjs')]),
    [], 'the before-run and the after-run are one measurement to this rule'
  );
});

test('it is silent where the rule does not reach', () => {
  assert.deepEqual(
    judge({ 'engine/hooks/stop-command.mjs': '// edited\n' }, [bash('git diff')]), [],
    'the Stop hook runs once a turn, not once a call'
  );
  assert.deepEqual(judge({ 'engine/checks/check_the_world.mjs': '// edited\n' }, [bash('git diff')]), []);
  assert.deepEqual(judge({ [JUDGE]: '// edited\n' }, null), [], 'CI carries no transcript');
});
