import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// This test lives at <repo>/engine-tests/hooks/session-start-command.test.mjs.
const HOOKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks');

// A hermetic corpus mirroring the real layout: the REAL engine/hooks/session-start-command.sh
// (it self-locates via BASH_SOURCE and resolves every step one level up at the
// corpus root) plus tiny STUB
// steps, so the test exercises the ORCHESTRATOR's own contract — sequence,
// stdout forwarding, lifecycle logging, exit 0 — without dragging in the real
// children and their dependencies.
function makeCorpus({ packStart = '', skills = '', env = '', interview = '', selftest = '', summary = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-sessionstart-'));
  mkdirSync(join(root, 'engine', 'hooks'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  copyFileSync(join(HOOKS_DIR, 'session-start-command.sh'), join(root, 'engine', 'hooks', 'session-start-command.sh'));
  writeFileSync(join(root, 'engine', 'selftest.mjs'), selftest);
  writeFileSync(join(root, 'engine', 'pack_loader', 'run-pack-session-start.mjs'), packStart);
  writeFileSync(join(root, 'engine', 'pack_loader', 'mount-skills.mjs'), skills);
  writeFileSync(join(root, 'engine', 'pack_loader', 'env-requirements.mjs'), env);
  writeFileSync(join(root, 'engine', 'pack_loader', 'session-summary.mjs'), summary);
  // The interview machinery is the adoption skill's, bundled in the claudinite-lifecycle pack.
  mkdirSync(join(root, 'packs', 'claudinite-lifecycle', 'skills', 'adopt-claudinite'), { recursive: true });
  writeFileSync(join(root, 'packs', 'claudinite-lifecycle', 'skills', 'adopt-claudinite', 'interview.mjs'), interview);
  return root;
}

function run(corpus, projectDir, env = {}) {
  return spawnSync('bash', [join(corpus, 'engine', 'hooks', 'session-start-command.sh')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDINITE_HOOK_RUN: 'testrun', ...env },
  });
}

test('orchestrator runs steps in order, forwards only step stdout, logs the lifecycle, exits 0', () => {
  const corpus = makeCorpus({
    packStart: 'process.stdout.write("PACKSTEP\\n");',
    summary: 'process.stdout.write("SUMMARY\\n");',
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  // Only the steps' stdout reaches the hook's stdout (→ session context), in
  // order, followed by the one-line confirmation footer; the timestamped log
  // goes to stderr + the file, never stdout.
  assert.ok(r.stdout.startsWith('PACKSTEP\nSUMMARY\n'), r.stdout);
  assert.match(r.stdout, /^Claudinite session-start: ran 7 steps \(git-config, mount-skills, selftest, pack-session-start, env-check, interview-check, session-summary\) at .+\.$/m);
  // No prose step, and none may come back (#807): static pack prose rides CLAUDE.md,
  // on a channel that does not truncate. This hook carries only what a session can
  // learn at session time.
  assert.doesNotMatch(r.stdout, /load-active-prose/);
  assert.doesNotMatch(r.stdout, /WARNING/); // all steps exited 0
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  for (const s of [
    'run=testrun orchestrator: start',
    'selftest: start', 'selftest: done exit=0',
    'pack-session-start: start', 'pack-session-start: done exit=0',
    'mount-skills: start', 'env-check: start', 'interview-check: start',
    'session-summary: start', 'session-summary: done exit=0',
    'run=testrun orchestrator: done',
  ]) assert.ok(log.includes(s), `log missing line: ${s}\n--- log ---\n${log}`);
});

test('the git-config step configures the CLONE, and is silent where there is no repo', () => {
  // The config is per-clone: set at environment-image build time it would be gone
  // from a fresh checkout, so the assertion is on the repo the session actually has.
  const corpus = makeCorpus();
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  spawnSync('git', ['init', '-q'], { cwd: projectDir });
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  const cfg = (key) =>
    spawnSync('git', ['-C', projectDir, 'config', '--get', key], { encoding: 'utf8' }).stdout.trim();
  assert.equal(cfg('merge.ours.driver'), 'true');
  assert.equal(cfg('rerere.enabled'), 'true');
  assert.doesNotMatch(r.stdout, /WARNING/);
  assert.doesNotMatch(r.stdout, /merge\.ours/, 'the step writes nothing into the session context');

  // No repo (a project dir that is not a checkout): fail-soft, logged, no warning.
  const bare = mkdtempSync(join(tmpdir(), 'claudinite-norepo-'));
  const r2 = run(corpus, bare);
  assert.equal(r2.status, 0);
  assert.doesNotMatch(r2.stdout, /WARNING/);
  assert.match(readFileSync(join(bare, '.claudinite-hooks.log'), 'utf8'), /git-config: no git repo at/);
});

test('the self-test judges a tree the converging steps have already converged', () => {
  // A probe must judge state that no LATER step in the same firing changes, and
  // mount-skills is the one step that converges what a probe reads: it rebuilds the
  // .claude/skills links probeSkillLinks judges. Ordered the other way round, a
  // resume whose mounts had gone stale reported dangling links that the same firing
  // repaired a second later — a finding about a state that no longer existed by the
  // time anyone read it, under a "re-run the skill mount" remedy that had already
  // run (#875).
  //
  // Asserted through the EFFECT rather than the label order, because the label
  // order is not the property: what matters is that the self-test can observe the
  // converged tree. The stub mount step converges (writes the marker) and the stub
  // self-test reports what it sees.
  const marker = (body) => `import { existsSync, writeFileSync } from "node:fs";\nconst m = process.env.CLAUDE_PROJECT_DIR + "/converged";\n${body}`;
  const corpus = makeCorpus({
    skills: marker('writeFileSync(m, "");'),
    selftest: marker('process.stdout.write((existsSync(m) ? "CONVERGED" : "STALE") + "\\n");'),
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^CONVERGED$/m);
});

test('a failing step never aborts the orchestrator nor turns the hook non-zero', () => {
  const corpus = makeCorpus({
    selftest: 'process.stdout.write("A\\n"); process.exit(1);', // a step exits non-zero...
    packStart: 'process.stdout.write("B\\n");',                // ...the rest still runs
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);            // a non-zero SessionStart exit would discard the context
  assert.ok(r.stdout.startsWith('A\nB\n'), r.stdout); // later steps still ran and forwarded
  // The footer flags the crashed step so a semantic failure is visible in-context.
  assert.match(r.stdout, /WARNING: selftest exited 1/);
  const log = readFileSync(join(projectDir, '.claudinite-hooks.log'), 'utf8');
  assert.ok(log.includes('selftest: done exit=1'), log);
});

test('the facet channel is opened for the steps and closed after them', () => {
  // The steps at the two ends of the channel are strangers: one appends, one reads,
  // and the orchestrator is the only thing that knows where the file is. It also
  // owns cleanup — session state must not outlive the session that made it.
  const corpus = makeCorpus({
    packStart: 'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.CLAUDINITE_SESSION_FACETS, "7 shrubberies\\n");',
    summary: 'import { readFileSync } from "node:fs";\nconst p = process.env.CLAUDINITE_SESSION_FACETS;\nprocess.stdout.write("CHANNEL " + p + " SAID " + readFileSync(p, "utf8").trim() + "\\n");',
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  const r = run(corpus, projectDir);
  assert.equal(r.status, 0);
  const m = /^CHANNEL (\S+) SAID 7 shrubberies$/m.exec(r.stdout);
  assert.ok(m, r.stdout);
  assert.equal(existsSync(m[1]), false, 'the channel file outlived the hook');
});
