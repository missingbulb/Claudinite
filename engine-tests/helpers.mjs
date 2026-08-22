import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../engine/checks/helpers/repo-context.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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

/**
 * Scratch git repo: `base` files committed on main, then a feature branch with
 * `changed` files committed on top (message `commitMsg`). Mirrors the runner's
 * real scoping model — merge-base with `main` — without needing a remote.
 */
export function makeRepo({ base = {}, changed = {}, commitMsg = 'change Refs #1', uncommitted = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-checks-'));
  git(root, 'init', '-q', '-b', 'main');
  writeFiles(root, { 'README.md': 'seed\n', ...base });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'seed');
  git(root, 'checkout', '-q', '-b', 'feature');
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
 */
export function makeTranscript(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-transcript-'));
  const path = join(dir, 'session.jsonl');
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
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
 * with no line anchor carries the explicit `line: null`), `severity` (exact),
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
        if ('severity' in expected) assert.equal(got.severity, expected.severity);
        if ('what' in expected) assert.match(got.what, expected.what);
        if ('fix' in expected) assert.match(got.fix, expected.fix);
      });
    });
  }
}
