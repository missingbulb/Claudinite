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
    "python3 - <<'PY'\np = 'packs/acme-pack/tasks/acme-task-z/task.md'\ns = open(p).read().replace('''run it with\nnode .claudinite/shared/engine/checks/check_the_world.mjs''', 'x')\nPY",
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

test('the dispatch guard: a worktree-isolated child told to create a branch named over git', () => {
  const dispatch = (prompt, isolation = 'worktree') =>
    ['Agent', { description: 'perf', subagent_type: 'general-purpose', isolation, prompt }];
  assert.deepEqual(judgeCalls('subagent-branch-named-git', [
    dispatch('Work in your worktree, on a branch named `perf/git-fixtures` created from `origin/main`.'),
    dispatch('In your worktree: `git switch -c perf/git-utils origin/main`. Commit there.'),
    // The same dispatch with a name the child can actually spell.
    dispatch('Work in your worktree, on a branch named `perf/fixtures` created from `origin/main`.'),
    // "git" inside a word is not the token the shell guard counts, so the separator
    // in the class is what keeps every branch named after a digit or a legitimate
    // thing out of the finding.
    dispatch('In your worktree: `git checkout -b claude/digit-fix origin/main`.'),
    // Without worktree isolation the child runs in the parent's checkout, under no
    // such guard, so the name costs it nothing.
    ['Agent', { description: 'perf', subagent_type: 'general-purpose', prompt: 'On a branch named `perf/git-fixtures`, report what you find.' }],
  ]), [
    'a worktree-isolated dispatch mandating a branch named over git: "branch named `perf/git-fixtures"',
    'a worktree-isolated dispatch mandating a branch named over git: "switch -c perf/git-utils"',
  ]);
});

test('the shell-write guard: a skill-scoped file written past the pre-edit guard', () => {
  // The three shell spellings a session actually reaches for, all taken from captured
  // sessions that went on to collect the Stop-time skill-loaded-before-editing finding.
  assert.deepEqual(judge('shell-write-to-skill-scoped-path', [
    "cat >> packs/acme-pack-t/test/signals.test.mjs <<'EOF'\ntest('x', () => {});\nEOF",
    "python3 - <<'PY'\np='packs/acme-pack/RULES.md'\ns=open(p).read()\nopen(p,'w').write(s)\nPY",
    "cat > packs/acme-pack-w/skills/acme-skill-r/SKILL.md <<'EOF'\n---\nEOF",
    'cat > packs/acme-pack-w/tasks/acme-task-s/task.json <<EOF\n{}\nEOF',
  ]).length, 4);
  // Reads, runs and redirects elsewhere are the bulk of a session's shell and must stay silent:
  // naming a scoped path is not writing one, and a redirect whose target is not a scoped path
  // (the suite's own output, the scratchpad) is the commonest command in the window.
  assert.deepEqual(judge('shell-write-to-skill-scoped-path', [
    "node --test $(git ls-files '*.test.mjs') > /tmp/s/suite.txt 2>&1",
    'node --test packs/acme-pack-t/test/signals.test.mjs 2>&1 | tail -5',
    'grep -rn --include=RULES.md "window" packs/',
    'node engine/checks/check_the_world.mjs; echo "EXIT:$?"',
    "cat > /tmp/s/scratchpad/probe.mjs <<'EOF'\nconsole.log(1);\nEOF",
  ]), []);
});

test('the sweep-reading guard: a severity filter over a check sweep', () => {
  // The shape #1890 shipped a false "both new checks are silent" claim on: both were
  // inside their `since` grace, so every finding they made printed as ADVISORY and the
  // filter dropped all seven. Either spelling — piped, or saved and grepped after.
  assert.deepEqual(judge('check-sweep-read-blocking-only', [
    'node engine/checks/check_the_world.mjs 2>&1 | grep -E "^\\[BLOCKING\\]"',
    'node engine/checks/check_the_world.mjs > /tmp/s/world.txt 2>&1; grep -c BLOCKING /tmp/s/world.txt',
  ]).length, 2);
  // Reading the sweep whole, slicing it by the check's own id, and grepping BLOCKING
  // out of something that is not a sweep at all, all stay silent.
  assert.deepEqual(judge('check-sweep-read-blocking-only', [
    'node engine/checks/check_the_world.mjs; echo "EXIT:$?"',
    'node engine/checks/check_the_work.mjs 2>&1 | tail -100',
    'node engine/checks/check_the_world.mjs 2>&1 | grep -A3 tasks-stage-barriers',
    'grep -rn "BLOCKING" engine/checks/helpers/findings.mjs',
  ]), []);
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

test('the transcript guard: a session file chosen by mtime rather than by session id', () => {
  // The shape #2111's diagnostic shipped with: a scan of every project directory for
  // the newest .jsonl, handed to a session in another repo, which then reported on its
  // own run. Both spellings a script arrives by — a heredoc, and a Write.
  const scan = "const root = join(homedir(), '.claude', 'projects');\n"
    + "for (const f of readdirSync(dir)) { if (!f.endsWith('.jsonl')) continue;\n"
    + '  const m = statSync(join(dir, f)).mtimeMs; if (!best || m > best.m) best = { p, m }; }';
  assert.deepEqual(judge('transcript-found-by-mtime', [`cat > /tmp/diag.mjs <<'EOF'\n${scan}\nEOF`]),
    ['a Bash locating a session transcript by newest mtime']);
  assert.deepEqual(judgeCalls('transcript-found-by-mtime', [['Write', { file_path: '/tmp/s/diag.mjs', content: scan }]]),
    ['a Write locating a session transcript by newest mtime']);
  // Naming the session — or the helper that resolves one — is the clean form, and the
  // ordinary reads that carry one of the three tokens alone must stay silent.
  assert.deepEqual(judge('transcript-found-by-mtime', [
    `node -e "const { findTranscript } = await import('./packs/claudinite-growth/capture-log.mjs');"`,
    'ls -la /root/.claude/projects/-home-user-Claudinite/',
    'ls -lt --time=mtime packs/',
    'git show origin/conversation-logs:2026-09-17T1652Z--pr-2111--e6579854.jsonl | head',
    // Prose about the guard is the commonest payload carrying all three words — a
    // commit message, a finding quoted back — so the match reads the stat property
    // rather than the word, and this line would fire if it read the word.
    "git commit -m 'Guard a transcript picked by mtime under ~/.claude/projects rather than <id>.jsonl'",
    // Two of the three tokens and a real selection: finding the most recently active
    // project directory is what makes the .jsonl third of the match load-bearing.
    `node -e "for (const d of readdirSync(root)) console.log(d, statSync(join(root, d)).mtimeMs)" # ~/.claude/projects`,
    // The other two-token pair: captures fetched off conversation-logs into the
    // scratchpad, ordered by write time. They are .jsonl and they are picked by
    // mtime, and they are not transcripts — the projects third is what says so.
    `node -e "for (const f of readdirSync(d).filter((f) => f.endsWith('.jsonl'))) console.log(f, statSync(join(d, f)).mtimeMs)" # scratchpad/logs`,
  ]), []);
  // Two writes that spell the forbidden shape without performing it: one pointing at
  // the helper, and this file itself, whose fixture is the shape. Without the rule's
  // own id in the exemption the second is denied — so the first session to weaken the
  // guard for a see-it-fail run would be stopped by the thing it is testing.
  assert.deepEqual(judgeCalls('transcript-found-by-mtime', [
    ['Write', { file_path: '/tmp/s/fix.mjs', content: `// ${scan}\n// see capture-log.mjs` }],
    ['Write', { file_path: 'action-guards.test.mjs', content: `judge('transcript-found-by-mtime', [\`${scan}\`]);` }],
  ]), []);
});
