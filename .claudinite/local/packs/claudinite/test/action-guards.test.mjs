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
  // A Monitor is a shell poll too: the same read through curl or gh, under a different tool.
  const monitor = declaredCheck('.claudinite/local/packs/claudinite', 'github-api-via-shell');
  const polled = makeTranscript([{ type: 'assistant', message: { content: [
    { type: 'tool_use', name: 'Monitor', input: { command: 'while true; do gh pr checks 1; sleep 30; done', description: 'ci', timeout_ms: 1000, persistent: false } },
    { type: 'tool_use', name: 'Monitor', input: { command: 'tail -f run.log', description: 'log', timeout_ms: 1000, persistent: false } },
  ] } }]);
  const root2 = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try {
    assert.deepEqual(runRule(monitor, buildContext({ root: root2, mode: 'all', transcriptPath: polled.path })).map((f) => f.what), ['a Monitor polling GitHub through the shell: "; do gh "']);
  } finally { cleanup(root2); polled.cleanup(); }
  // The phrase inside text a command carries — a commit message, a heredoc line
  // mid-sentence — is not the command, and the guard must not read it as one.
  assert.deepEqual(judge('git-pull-on-shallow-clone', ['git commit -m "never run git pull here"', 'echo "(git pull, merging main)"']), []);
  assert.deepEqual(judge('commit-all-sweeps-edits', ['echo "git commit -am is a trap"']), []);
});

test('the waiting and suite guards', () => {
  assert.deepEqual(judge('bare-sleep-wait', ['sleep 30', 'ls; sleep 5', 'until test -f out; do sleep 1; done']), ['a bare "sleep 30"', 'a bare "; sleep 5"']);
  // A fixed-count loop around a bare sleep is the same wait spelled to dodge the
  // regex above — bounded polling (until/while) must stay clean.
  assert.deepEqual(judge('bare-sleep-wait', [
    'for i in 1..3; do sleep 20; done; echo waited',
    'while ! curl -sf http://x; do sleep 5; done',
  ]), ['a counted loop with nothing but a sleep in its body: "for i in 1..3; do sleep 20; done"']);
  // The opposite spelling: a loop that names its condition but never yields, so it holds
  // the shell until somebody interrupts it. A body that sleeps is the clean form, and the
  // words inside a quoted string are not a loop.
  assert.deepEqual(judge('busy-wait-loop', [
    'until [ -s /tmp/out ]; do :; done; cat /tmp/out',
    'while ! test -f done.flag; do true; done',
    'until test -f out; do sleep 2; done',
    'echo "until x; do :; done"',
  ]), [
    'a loop that spins without waiting: "until [ -s /tmp/out ]; do :; done"',
    'a loop that spins without waiting: "while ! test -f done.flag; do true; done"',
  ]);
  assert.deepEqual(judge('test-suite-command-form', [
    'node --test engine-tests/*.test.mjs',
    'node --test',
    "node --test $(git ls-files '*.test.mjs')",
    'node --test engine-tests/pattern-rules.test.mjs',
  ]), ['the suite run through a glob: "node --test engine-tests/*"', 'node --test with no files named']);
});

test('the mount guard: an engine module run through a vendored path only members have', () => {
  assert.deepEqual(judge('mount-path-in-the-canon-home', [
    'node .claudinite/shared/engine/checks/check_the_world.mjs 2>&1 | tail -20; echo "EXIT:$?"',
    'CLAUDINITE_CHECKS_NO_FETCH=1 node .claudinite/shared/engine/checks/check_the_work.mjs',
    'node engine/checks/check_the_world.mjs',
    // A member's checkout cloned into this session DOES carry the mount, so a
    // command saying which tree it runs in is the legitimate use.
    'cd /home/user/Shepherd && node .claudinite/shared/engine/checks/check_the_world.mjs',
    // …including the fake consumer tree a session builds in its scratchpad, where
    // the cd naming it sits inside a subshell rather than at the command's head.
    '(cd "$T" && CLAUDINITE_CHECKS_NO_FETCH=1 node .claudinite/shared/engine/checks/check_the_world.mjs)',
    // The two-root form the mount rule prescribes already survives both layouts.
    'node .claudinite/shared/engine/checks/check_the_world.mjs 2>/dev/null || node engine/checks/check_the_world.mjs',
    // The path as text — grepped for, or rewritten into a member-facing doc through
    // a heredoc — is data the command carries, not a command the shell runs.
    'grep -rn "\\.claudinite/shared/engine" packs/',
    "python3 - <<'PY'\np = 'packs/basics/tasks/baselining/task.md'\ns = open(p).read().replace('''run it with\nnode .claudinite/shared/engine/checks/check_the_world.mjs''', 'x')\nPY",
  ]), [
    'an engine module run through the mount: "node .claudinite/shared/"',
    'an engine module run through the mount: "CLAUDINITE_CHECKS_NO_FETCH=1 node .claudinite/shared/"',
  ]);
});

test('the commit guard', () => {
  assert.deepEqual(judge('commit-all-sweeps-edits', ['git commit -am "probe"', 'git commit -m "real" -- a.mjs']), ['a commit with -a']);
});

// Guards over tools other than Bash: the call is [name, input].
const judgeCalls = (id, calls) => {
  const rule = declaredCheck('.claudinite/local/packs/claudinite', id);
  const session = makeTranscript(calls.map(([name, input]) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })));
  const root = makeRepo({ changed: { 'a.txt': 'x\n' } });
  try { return runRule(rule, buildContext({ root, mode: 'all', transcriptPath: session.path })).map((f) => f.what); }
  finally { cleanup(root); session.cleanup(); }
};

test('the filing guards: a cross-repo Verify line, an add_repo, a scratch screenshot', () => {
  assert.deepEqual(judgeCalls('cross-repo-verify-line', [
    ['mcp__github__issue_write', { method: 'create', body: 'Original-issue: #1\nVerify: missingbulb/Shepherd stamps engineVersion 3' }],
    ['mcp__github__issue_write', { method: 'create', body: 'Verify: missingbulb/Claudinite issue #1 is closed' }],
    // A member's PUBLIC raw URL is readable anonymously, so the coded form may probe it.
    ['mcp__github__issue_write', { method: 'create', body: 'Live-probe: https://raw.githubusercontent.com/missingbulb/Shepherd/main/x :: status 200' }],
    // The API is not: probe fetches carry no credential (#1792).
    ['mcp__github__issue_write', { method: 'create', body: 'Verify-probe: https://api.github.com/repos/missingbulb/Shepherd/issues/9 :: json state == closed' }],
  ]), [
    'a verification line reading another repository: "Verify: missingbulb/Shepherd"',
    'a probe fetching the GitHub API: "Verify-probe: https://api.github.com"',
  ]);
  assert.deepEqual(judgeCalls('add-repo-for-a-public-clone', [
    ['mcp__Claude_Code_Remote__add_repo', { owner: 'missingbulb', repo: 'Shepherd' }],
    ['mcp__Claude_Code_Remote__list_repos', { query: 'shep' }],
  ]), ['an add_repo for "Shepherd"']);
  assert.deepEqual(judgeCalls('scratch-screenshot-caption', [
    ['SendUserFile', { files: ['/tmp/s/scratchpad/shot.png'], status: 'normal' }],
    ['SendUserFile', { files: ['/tmp/s/scratchpad/shot.png'], status: 'normal', caption: 'rendered from a scratch harness, not the app' }],
    ['SendUserFile', { files: ['/repo/docs/real.png'], status: 'normal' }],
    ['SendUserFile', { files: ['/tmp/s/scratchpad/report.md'], status: 'normal' }],
  ]), ['a screenshot from the scratchpad sent without saying it came from a scratch harness']);
});

test('the restore and settings guards', () => {
  assert.deepEqual(judge('checkout-restores-index', ['git checkout -- a.mjs', 'git stash', 'git checkout -b feature', 'echo "git checkout -- x"']), [
    'a working-tree restore: "git checkout --"', 'a working-tree restore: "git stash"',
  ]);
  assert.deepEqual(judge('settings-json-reserialized', [
    "node -e \"fs.writeFileSync('.claudinite-settings.json', JSON.stringify(s, null, 2))\"",
    "python3 -c 'json.dump(settings, open(p, \"w\"))'",
    'cat .claudinite-settings.json',
  ]).length, 2);
});
