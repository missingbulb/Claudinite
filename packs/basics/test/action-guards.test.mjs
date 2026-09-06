import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript, declaredCheck } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';

// Each guard judged at Stop over a transcript: the offending calls flag, the
// clean ones beside them do not.
const judge = (id, calls) => {
  const rule = declaredCheck('packs/basics', id);
  const session = makeTranscript(calls.map(([name, input]) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })));
  const root = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try { return runRule(rule, buildContext({ root, mode: 'all', transcriptPath: session.path })).map((f) => f.what); }
  finally { cleanup(root); session.cleanup(); }
};

test('grep-context-without-content', () => {
  assert.deepEqual(judge('grep-context-without-content', [
    ['Grep', { pattern: 'x', '-A': 2 }],
    ['Grep', { pattern: 'x', context: 1, output_mode: 'content' }],
    ['Grep', { pattern: 'x' }],
  ]), ['a Grep with a context flag and no output_mode: "content"']);
});

test('generated-file-hand-edit', () => {
  assert.deepEqual(judge('generated-file-hand-edit', [
    ['Edit', { file_path: '/r/packs/directory.GENERATED.md', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: '/r/docs/notes.md', content: 'x' }],
    ['Bash', { command: 'node gen.mjs > out.GENERATED.md' }],
  ]), ['a hand edit of a GENERATED file']);
});

test('wakeup-without-prompt', () => {
  assert.deepEqual(judge('wakeup-without-prompt', [
    ['ScheduleWakeup', { delaySeconds: 60, noop: true, reason: 'r' }],
    ['ScheduleWakeup', { delaySeconds: 60, prompt: 'p', reason: 'r' }],
    ['ScheduleWakeup', { stop: true }],
  ]), ['a ScheduleWakeup call without a prompt']);
});

test('pipe-tail-hides-exit and pkill-pattern-self-match', () => {
  assert.deepEqual(judge('pipe-tail-hides-exit', [
    ['Bash', { command: 'node --test $(git ls-files "*.test.mjs") 2>&1 | tail -20' }],
    ['Bash', { command: 'node --test x.test.mjs > out.txt; tail -3 out.txt' }],
    ['Bash', { command: 'grep -n needle file.txt | head -5' }],
  ]), ['a run whose output ends in "node --test $(git ls-files "*.test.mjs") 2>&1 | tail -20"']);
  assert.deepEqual(judge('pkill-pattern-self-match', [
    ['Bash', { command: 'pkill -f http.server' }],
    ['Bash', { command: "pkill -f '[h]ttp.server'" }],
  ]), ['pkill -f with the unbracketed pattern "http.server"']);
});

test('pull-request-without-closing-line and github-list-without-fields', () => {
  assert.deepEqual(judge('pull-request-without-closing-line', [
    ['mcp__github__create_pull_request', { title: 't', body: 'Refs #12\n' }],
    ['mcp__github__create_pull_request', { title: 't', body: 'Closes #12\nRefs #1\n' }],
  ]), ['a pull request whose body carries no "Closes #<issue>" line of its own']);
  assert.deepEqual(judge('github-list-without-fields', [
    ['mcp__github__list_issues', { owner: 'o', repo: 'r' }],
    ['mcp__github__search_issues', { query: 'q', fields: ['number'] }],
    ['mcp__github__get_me', {}],
  ]), ['a mcp__github__list_issues call with no fields']);
});

test('ask-user-question-already-decided biases every blocking question, and only that tool', () => {
  assert.deepEqual(judge('ask-user-question-already-decided', [
    ['AskUserQuestion', { questions: [{ question: 'Merge?', header: 'Merge', options: [{ label: 'a', description: 'b' }, { label: 'c', description: 'd' }], multiSelect: false }] }],
    ['Bash', { command: 'echo AskUserQuestion' }],
  ]), ['a blocking question to the owner']);
});

test('bare-wait-in-fresh-shell: a wait with no job launched in the same call', () => {
  assert.deepEqual(judge('bare-wait-in-fresh-shell', [
    ['Bash', { command: 'wait' }],
    ['Bash', { command: 'sleep 30; wait $!' }],
    ['Bash', { command: 'node build.mjs & wait' }],
    ['Bash', { command: 'node build.mjs > out.txt 2>&1 &\nwait\ncat out.txt' }],
    ['Bash', { command: 'git commit -m "wait for CI" && git push' }],
    ['Bash', { command: 'awaited=1; echo $awaited' }],
  ]), ['a "wait" in a shell that launched nothing', 'a "wait $!" in a shell that launched nothing']);
});

test('manufactured-no-op-call: a call whose only purpose is to occupy the turn', () => {
  assert.deepEqual(judge('manufactured-no-op-call', [
    ['Bash', { command: 'sleep 1; echo waiting' }],
    ['Bash', { command: 'true' }],
    ['Bash', { command: 'echo "still waiting for the subagent"' }],
    ['Bash', { command: 'echo done > status.txt' }],
    ['Bash', { command: 'sleep 5; cat out.txt' }],
  ]), ['a no-op call ("sleep 1; echo waiting") made only to pass the turn', 'a no-op call ("true") made only to pass the turn', 'a no-op call ("echo "still waiting for the subagent"") made only to pass the turn']);
});
