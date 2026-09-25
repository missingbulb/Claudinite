import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../engine/checks/helpers/repo-context.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { format } from 'node:util';
import { loadDeclaredChecks } from '../engine/checks/helpers/pattern-rules.mjs';
import { runRule } from '../engine/checks/helpers/work.mjs';
import { removeTree } from '../engine/remove-tree.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test',
  // No detached git process may outlive a fixture command (#235): auto-gc runs in
  // the foreground and the newer maintenance path stays off, so cleanup() never
  // races a background repack still writing into .git/objects. This is the fix;
  // `removeTree`'s retry is the second line of defense behind it, and covers the
  // trees deleted by code that does not set this env.
  // …and no fixture commit may reach the developer's signing setup. A throwaway
  // tmpdir commit gains nothing from a signature, and inheriting the ambient
  // `commit.gpgsign` makes every one of them a round trip to a signing service:
  // measured in a signing session, a makeRepo fixture costs 202ms against 38ms
  // with this off, and a service that degrades blocks each commit and leaks the
  // descriptors behind it until git fails process-wide.
  GIT_CONFIG_COUNT: '3',
  GIT_CONFIG_KEY_0: 'gc.autoDetach', GIT_CONFIG_VALUE_0: 'false',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
  GIT_CONFIG_KEY_2: 'commit.gpgsign', GIT_CONFIG_VALUE_2: 'false',
};

// THE CANON PACKS A CASE REACHES FOR WHEN IT NEEDS *A* PACK RATHER THAN A
// PARTICULAR ONE - laying a mount down on a member, planning an update, stamping
// a version. Every such case holds for any id on the shelf, so the id is spelled
// here once and a rename or retirement is an edit of these two lines instead of
// every suite that happened to name it. A case that is genuinely ABOUT one pack
// names that pack itself; a case whose pack is invented uses a fake id and comes
// nowhere near here.
export const A_CANON_PACK = 'basics';
export const ANOTHER_CANON_PACK = 'claudinite-growth';

export function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, env: GIT_ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

/**
 * `git` with the commit's author/committer date pinned to `epochSeconds`. History whose
 * commits all share one timestamp is ambiguous to git where dates break ties — most
 * visibly `merge-base`, which returns one of several equally-good answers — so a test
 * that depends on the shape of the graph pins the dates instead of racing the clock.
 */
export function gitDated(root, epochSeconds, ...args) {
  const stamp = `${epochSeconds} +0000`;
  const r = spawnSync('git', args, {
    cwd: root, encoding: 'utf8',
    env: { ...GIT_ENV, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

// The seeded repo every fixture starts from, built once per process and copied
// rather than rebuilt. `git init` + the seed commit + the feature branch is four
// subprocesses (~27ms), and it produces a byte-identical starting point for every
// fixture — the suite makes this call over a thousand times. A file copy of the
// result is ~3ms.
//
// The copy is what the pruning is for: git writes ten files here that it never
// reads back in a fixture's life — the hook samples above all, plus info/exclude,
// branches/, description and the reflog — and they were four fifths of the copy.
// Anything git needs from them it recreates on demand.
let seedTemplate = null;
function templateRepo() {
  if (seedTemplate) return seedTemplate;
  const root = mkdtempSync(join(tmpdir(), 'claudinite-checks-seed-'));
  git(root, 'init', '-q', '-b', 'main');
  writeFiles(root, { 'README.md': 'seed\n' });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'seed');
  git(root, 'checkout', '-q', '-b', 'feature');
  for (const inert of ['hooks', 'info', 'branches', 'logs', 'description']) {
    removeTree(join(root, '.git', inert));
  }
  process.on('exit', () => removeTree(root));
  seedTemplate = root;
  return root;
}

/**
 * Scratch git repo: `base` files committed on main, then a feature branch with
 * `changed` files committed on top (message `commitMsg`). Mirrors the runner's
 * real scoping model — merge-base with `main` — without needing a remote.
 */
export function makeRepo({ base = {}, changed = {}, commitMsg = 'change Refs #1', uncommitted = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-checks-'));
  cpSync(templateRepo(), root, { recursive: true });
  // `base` files belong in the commit `main` names, which the template's seed
  // commit is not — so they arrive as a commit on top of the copy and `main` moves
  // onto it. What a context reads is the merge-base with `main` and the range above
  // it, both of which that move reproduces exactly; the tree at the merge-base is
  // the same tree the one-commit seed had, README override included.
  if (Object.keys(base).length) {
    writeFiles(root, base);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'seed');
    git(root, 'branch', '-f', 'main', 'HEAD');
  }
  if (Object.keys(changed).length) {
    writeFiles(root, changed);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', commitMsg);
  }
  writeFiles(root, uncommitted);
  return root;
}

export function deletePath(root, path, commitMsg = 'delete Refs #1') {
  git(root, 'rm', '-q', path);
  git(root, 'commit', '-q', '-m', commitMsg);
}

/**
 * Scratch session transcript (Claude Code JSONL) for conversation-surface
 * rules. Lives outside any scratch repo so it never appears in ctx.files.
 *
 * `subagents` maps an agent id to that subagent's own entries, laid out where
 * Claude Code puts them — `<session>/subagents/agent-<id>.jsonl` beside the
 * session file — so a test can exercise a reader over the whole session.
 */
export function makeTranscript(entries, subagents = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-transcript-'));
  const path = join(dir, 'session.jsonl');
  const jsonl = (es) => es.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(path, jsonl(entries));
  const agentDir = join(dir, 'session', 'subagents');
  for (const [id, agentEntries] of Object.entries(subagents)) {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, `agent-${id}.jsonl`), jsonl(agentEntries));
  }
  return { path, cleanup: () => removeTree(dir) };
}

// One declared check, by rule id, out of a pack's or skill's declared-checks.json
// — the test-side counterpart to the registry's structural discovery, so a test
// proves the same compiled rule object the runner runs. `dir` is repo-relative
// (`packs/aws-sam`). An unknown id is the test's bug, not a silent undefined.
export function declaredCheck(dir, id) {
  const rules = loadDeclaredChecks(join(repoRoot, dir));
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error(`${dir}/declared-checks.json declares no rule "${id}" (it has: ${rules.map((r) => r.id).join(', ')})`);
  return rule;
}

// Kept as the name every fixture already calls; the retry it exists for now lives
// in one place, with the whole story of why (engine/remove-tree.mjs).
export function cleanup(root) {
  removeTree(root);
}

/**
 * Table-driven rule testing — a test case is its data: a repo shape in, the
 * expected findings out. Each entry in `clean` / `flagged` registers one
 * node:test; makeRepo / buildContext / try-finally-cleanup live here so the
 * test file reads as fixture -> expectation and nothing else.
 *
 *   ruleTester(rule, {
 *     clean: {
 *       'the safe state stays silent': { files: { 'a.txt': 'ok\n' } },
 *     },
 *     flagged: {
 *       'the hazard is reported at its line': {
 *         files: { 'a.txt': 'bad\n' },
 *         at: [{ file: 'a.txt', line: 1, what: /bad/ }],
 *       },
 *     },
 *   });
 *
 * A case's repo shape: `files` commits on the feature branch (makeRepo
 * `changed`, under `commitMsg` where the rule judges the message), `base` on
 * main, `uncommitted` stays untracked; `mode` defaults to 'all'. The rule is
 * invoked through `runRule`, the same dispatch seam the runner uses, so a
 * work-scoped rule gets its fluent surface here exactly as it does in a run.
 * A flagged case's `at` lists every expected finding in engine
 * order; each expectation may pin `file` (exact), `line` (exact — a finding
 * with no line anchor carries the explicit `line: null`), `on_fail` (exact),
 * and `what` / `fix` (regexes). Keys an expectation omits are not judged.
 */
export function ruleTester(rule, { clean = {}, flagged = {} }) {
  const runCase = (c) => {
    const root = makeRepo({
      base: c.base ?? {}, changed: c.files ?? {}, uncommitted: c.uncommitted ?? {},
      ...(c.commitMsg ? { commitMsg: c.commitMsg } : {}),
    });
    try {
      return runRule(rule, buildContext({ root, mode: c.mode ?? 'all' }));
    } finally { cleanup(root); }
  };
  for (const [name, c] of Object.entries(clean)) {
    test(`${rule.id}: ${name}`, () => {
      assert.deepEqual(runCase(c), []);
    });
  }
  for (const [name, c] of Object.entries(flagged)) {
    test(`${rule.id}: ${name}`, () => {
      const findings = runCase(c);
      assert.equal(findings.length, c.at.length,
        `expected ${c.at.length} finding(s), got ${findings.length}: ${JSON.stringify(findings, null, 2)}`);
      c.at.forEach((expected, i) => {
        const got = findings[i];
        if ('file' in expected) assert.equal(got.file, expected.file);
        if ('line' in expected) assert.equal(got.line, expected.line);
        if ('on_fail' in expected) assert.equal(got.on_fail, expected.on_fail);
        if ('what' in expected) assert.match(got.what, expected.what);
        if ('fix' in expected) assert.match(got.fix, expected.fix);
      });
    });
  }
}

// Run a top-level CLI module in THIS process rather than spawning a node for it:
// import it under a fresh query string so its body re-evaluates on every call,
// with argv and the console channels swapped for the duration. The return shape
// is spawnSync's — { status, stdout, stderr } — so a test converted onto it
// asserts exactly what it asserted through a real process.
//
// Only for a module that ends on `process.exitCode` (check_the_world.mjs and
// check_the_work.mjs both do, deliberately: #2062). One that calls process.exit
// takes the test runner down with it and must keep spawning.
//
// It does NOT stand in for the process contract itself — a pipe's asynchronous
// write, which is what truncated the catalog in #2062, and a real exit status are
// both invisible from in here. Each entry point keeps a spawning test for that.
let inProcessCall = 0;
export async function runScriptInProcess(script, args = []) {
  const argv = process.argv;
  const { log, error } = console;
  // The module under test sets process.exitCode; left in place it becomes the
  // TEST process's own exit status, turning a green run red (or the reverse).
  const callersExitCode = process.exitCode;
  let stdout = '', stderr = '';
  process.argv = [process.execPath, script, ...args];
  console.log = (...a) => { stdout += format(...a) + '\n'; };
  console.error = (...a) => { stderr += format(...a) + '\n'; };
  process.exitCode = undefined;
  try {
    await import(`${pathToFileURL(script).href}?call=${inProcessCall++}`);
    return { status: process.exitCode ?? 0, stdout, stderr };
  } finally {
    process.exitCode = callersExitCode;
    process.argv = argv;
    console.log = log;
    console.error = error;
  }
}
