import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript, declaredCheck } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../../engine/checks/helpers/work.mjs';

const PACK = 'packs/claudinite-tasks';

// The guard reads one `issue_write` call's `labels`, so a case is the array a
// session would have sent.
const judgeLabels = (...calls) => {
  const rule = declaredCheck(PACK, 'issue-label-outside-the-queue-vocabulary');
  const session = makeTranscript(calls.map((input) => ({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'mcp__github__issue_write', input }] },
  })));
  const root = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try { return runRule(rule, buildContext({ root, mode: 'all', transcriptPath: session.path })).map((f) => f.what); }
  finally { cleanup(root); session.cleanup(); }
};

const filed = (labels) => ({ method: 'create', owner: 'o', repo: 'r', title: 't', ...(labels ? { labels } : {}) });

test('a label outside the task: vocabulary is the invention the guard names', () => {
  assert.deepEqual(judgeLabels(filed(['bug'])), ['an issue labelled `bug`, which no queue code reads']);
  // Three spellings sessions actually invented here, each naming a mechanism that
  // does not exist and each read as a queue mark by the session that applied it.
  assert.deepEqual(judgeLabels(filed(['claudinite-queue']), filed(['conformance-backlog']), filed(['plan-tracking'])), [
    'an issue labelled `claudinite-queue`, which no queue code reads',
    'an issue labelled `conformance-backlog`, which no queue code reads',
    'an issue labelled `plan-tracking`, which no queue code reads',
  ]);
  // An invention beside a real mark is still an invention, and the finding names
  // the invented one rather than the array.
  assert.deepEqual(judgeLabels(filed(['task:origin:ad-hoc', 'needs-decision'])), [
    'an issue labelled `needs-decision`, which no queue code reads',
  ]);
});

test('the queue vocabulary, and a filing with no label at all, pass', () => {
  assert.deepEqual(judgeLabels(filed(['task:origin:ad-hoc'])), []);
  assert.deepEqual(judgeLabels(filed(['task:origin:ad-hoc', 'task:status:blocked'])), []);
  assert.deepEqual(judgeLabels(filed(['task:urgent', 'task:status:needs-human-approval'])), []);
  // The legacy spellings a fielded engine still writes or reads.
  assert.deepEqual(judgeLabels(filed(['claude-task']), filed(['claude-queued']), filed(['needs-human'])), []);
  // The ordinary filing: an issue for a person, wearing nothing.
  assert.deepEqual(judgeLabels(filed(null)), []);
});

// The prose half: an instruction that says to mark an issue for the queue and
// leaves the label to the reader is what produced those invented labels.
const judgeProse = (files) => {
  const rule = declaredCheck(PACK, 'queue-mark-named-literally');
  const root = makeRepo({ changed: files });
  try { return runRule(rule, buildContext({ root, mode: 'all' })).map((f) => f.what); }
  finally { cleanup(root); }
};

test('an instruction that files queue work names the mark literally', () => {
  assert.deepEqual(judgeProse({
    'packs/acme-pack/skills/acme-skill/SKILL.md': 'an ordinary issue, marked for the queue, carrying its own brief.\n',
    'packs/acme-pack/tasks/acme-task/task.md': 'land the lesson as prose and open a tagged conformance-backlog issue.\n',
  }), [
    'an instruction to mark an issue for the queue that names no label: "marked for the queue"',
    'a backlog issue asked for by a tag nothing defines: "tagged conformance-backlog issue"',
  ]);
  // Naming the mark on the line is what clears it, whichever way the sentence
  // reaches it — in a local pack's prose too, the tree no converge rewrites.
  assert.deepEqual(judgeProse({
    '.claudinite/local/packs/acme-pack/RULES.md': 'an ordinary issue, marked for the queue with `task:origin:ad-hoc`, carrying its brief.\n',
    'packs/acme-pack/RULES.md': 'open a tagged backlog issue, marked `task:origin:ad-hoc`, for the conversion.\n',
  }), []);
  // Prose that neither files nor marks anything: the words the rule watches for
  // are what it fires on, and a README is not an instruction surface.
  assert.deepEqual(judgeProse({
    'packs/acme-pack/README.md': 'an ordinary issue, marked for the queue.\n',
    'packs/acme-pack/RULES.md': 'the queue adopts the issue and gives it a status.\n',
  }), []);
});
