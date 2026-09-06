import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup, makeTranscript, declaredCheck } from '../../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../../../engine/checks/helpers/work.mjs';

const judge = (id, commands) => {
  const rule = declaredCheck('.claudinite/local/packs/claudinite', id);
  const session = makeTranscript(commands.map((command) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } })));
  const root = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try { return runRule(rule, buildContext({ root, mode: 'all', transcriptPath: session.path })).map((f) => f.what); }
  finally { cleanup(root); session.cleanup(); }
};

test('the git guards: pull, merge of main, GitHub through the shell', () => {
  assert.deepEqual(judge('git-pull-on-shallow-clone', ['git pull origin main', 'git fetch origin main && git reset --hard origin/main']), ['a git pull']);
  assert.deepEqual(judge('merge-main-into-branch', ['git merge origin/main', 'git rebase origin/main', 'git merge feature']), ['a merge of main into the branch']);
  assert.deepEqual(judge('github-api-via-shell', ['curl -s https://api.github.com/repos/o/r/pulls', 'gh pr view 1', 'git fetch origin', 'echo "see api.github.com"']), [
    'a GitHub read through the shell: "curl -s https://api.github.com"', 'a GitHub read through the shell: "gh "',
  ]);
  // The phrase inside text a command carries — a commit message, a heredoc line
  // mid-sentence — is not the command, and the guard must not read it as one.
  assert.deepEqual(judge('git-pull-on-shallow-clone', ['git commit -m "never run git pull here"', 'echo "(git pull, merging main)"']), []);
  assert.deepEqual(judge('commit-all-sweeps-edits', ['echo "git commit -am is a trap"']), []);
});

test('the waiting and suite guards', () => {
  assert.deepEqual(judge('bare-sleep-wait', ['sleep 30', 'ls; sleep 5', 'until test -f out; do sleep 1; done']), ['a bare "sleep 30"', 'a bare "; sleep 5"']);
  assert.deepEqual(judge('test-suite-command-form', [
    'node --test engine-tests/*.test.mjs',
    'node --test',
    "node --test $(git ls-files '*.test.mjs')",
    'node --test engine-tests/pattern-rules.test.mjs',
  ]), ['the suite run through a glob: "node --test engine-tests/*"', 'node --test with no files named']);
});

test('the commit and question guards', () => {
  assert.deepEqual(judge('commit-all-sweeps-edits', ['git commit -am "probe"', 'git commit -m "real" -- a.mjs']), ['a commit with -a']);
  const rule = declaredCheck('.claudinite/local/packs/claudinite', 'ask-user-question-cost');
  const session = makeTranscript([{ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: 'q?' }] } }] } }]);
  const root = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try {
    assert.deepEqual(runRule(rule, buildContext({ root, mode: 'all', transcriptPath: session.path })).map((f) => f.severity), ['advisory']);
  } finally { cleanup(root); session.cleanup(); }
});
