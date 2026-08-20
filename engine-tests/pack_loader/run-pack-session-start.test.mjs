import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The pack SESSION-START runner: the counterpart of the SessionEnd runner at the
// other end of the session, and the one way a pack contributes context it has to
// COMPUTE. Static prose rides CLAUDE.md through the generated rules index (#807);
// this is for what a pack can only know at session time — content fetched, derived,
// or keyed to the person in front of it, and so the only thing left on this hook.
//
// The contract under test is entirely generic: discover, run, forward, bound,
// fail soft. Core never learns what any step DOES — the same terms the SessionEnd
// runner states — so every fixture below is a nonsense pack, deliberately.
function makeCorpus(packs) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-corpus-'));
  mkdirSync(join(root, 'packs'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  // The whole loader directory — see mount-skills.test.mjs: an enumerated subset
  // breaks fail-soft the day the registry gains a sibling.
  cpSync(join(REPO_ROOT, 'engine', 'pack_loader'), join(root, 'engine', 'pack_loader'), { recursive: true });
  // pack-schema validates a version against the engine's version module, which sits
  // beside pack_loader in the real tree.
  cpSync(join(REPO_ROOT, 'engine', 'version.mjs'), join(root, 'engine', 'version.mjs'));
  for (const [id, { step, ...manifest }] of Object.entries(packs)) {
    mkdirSync(join(root, 'packs', id), { recursive: true });
    writeFileSync(
      join(root, 'packs', id, 'pack.mjs'),
      `export default ${JSON.stringify({ id, detect: null, worldRules: [], ruleRoutingGuidance: { belongs: `whatever ${id} owns`, excludes: `whatever ${id} does not own` }, ...manifest })};\n`,
    );
    // A pack contributes a step by SHIPPING THE FILE — no manifest field, exactly
    // as session-end.mjs is discovered. A pack with no step writes none.
    if (step !== undefined) writeFileSync(join(root, 'packs', id, 'session-start.mjs'), step);
  }
  return root;
}

function makeProject(declaration) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  writeFileSync(join(root, '.claudinite-checks.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  return root;
}

function run(corpus, project, env = {}) {
  const r = spawnSync('node', [join(corpus, 'engine', 'pack_loader', 'run-pack-session-start.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env },
  });
  // A non-zero exit makes Claude Code DISCARD the orchestrator's whole stdout, so
  // this runner may never produce one — whatever a step did.
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('runs each active pack\'s step and forwards its stdout under the pack marker', () => {
  const corpus = makeCorpus({
    alpha: { step: 'process.stdout.write("ALPHA SAYS\\n");' },
    beta: { step: 'process.stdout.write("BETA SAYS\\n");' },
  });
  const project = makeProject({ packs: ['alpha', 'beta'] });
  try {
    const out = run(corpus, project);
    assert.match(out, /<!-- pack:alpha -->\nALPHA SAYS/);
    assert.match(out, /<!-- pack:beta -->\nBETA SAYS/);
    assert.ok(out.indexOf('alpha') < out.indexOf('beta'), 'steps run in a stable order');
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('an undeclared pack\'s step never runs, and a pack with no step is skipped silently', () => {
  const corpus = makeCorpus({
    declared: { step: 'process.stdout.write("YES\\n");' },
    undeclared: { step: 'process.stdout.write("MUST NOT RUN\\n");' },
    quiet: {},                                   // no session-start.mjs at all
  });
  const project = makeProject({ packs: ['declared', 'quiet'] });
  try {
    const out = run(corpus, project);
    assert.match(out, /YES/);
    assert.doesNotMatch(out, /MUST NOT RUN/);
    assert.doesNotMatch(out, /quiet/, 'a pack contributing no step contributes no marker either');
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('a step is handed its own pack entry config, and nothing else has to re-read settings', () => {
  const corpus = makeCorpus({ alpha: { step: 'process.stdout.write(`CONFIG=${process.env.CLAUDINITE_PACK_CONFIG}\\n`);' } });
  const project = makeProject({ packs: [{ id: 'alpha', config: { repo: 'o/r', n: 3 } }] });
  try {
    const out = run(corpus, project);
    assert.match(out, /CONFIG=\{"repo":"o\/r","n":3\}/);
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('a step that declares nothing gets an empty config object, never undefined', () => {
  const corpus = makeCorpus({ alpha: { step: 'process.stdout.write(`CONFIG=${process.env.CLAUDINITE_PACK_CONFIG}\\n`);' } });
  const project = makeProject({ packs: ['alpha'] });
  try {
    assert.match(run(corpus, project), /CONFIG=\{\}/);
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('a step that fails, crashes or prints nothing never breaks the session', () => {
  // Fail-soft, absolutely: preferences-shaped context is a nice-to-have, and the
  // load-bearing cargo (packs, checks, skills) is already local. A step that dies
  // is one plain-text note — never a halt directive, never a JSON envelope, never
  // a non-zero exit (which would discard the whole orchestrator's stdout).
  const corpus = makeCorpus({
    exploder: { step: 'throw new Error("boom");' },
    exiter: { step: 'process.stdout.write("PARTIAL\\n"); process.exit(3);' },
    silent: { step: '// says nothing\n' },
    fine: { step: 'process.stdout.write("STILL RAN\\n");' },
  });
  const project = makeProject({ packs: ['exploder', 'exiter', 'silent', 'fine'] });
  try {
    const out = run(corpus, project);
    assert.match(out, /STILL RAN/, 'one bad step never stops the others');
    assert.match(out, /exploder/, 'the failure is named, not swallowed');
    assert.doesNotMatch(out, /STOP|AskUserQuestion/);
    assert.doesNotMatch(out, /hookSpecificOutput|additionalContext/);
    // A step that exits non-zero has said something unreliable: its partial output
    // is not injected as if it were the finished thing.
    assert.doesNotMatch(out, /PARTIAL/);
    assert.doesNotMatch(out, /<!-- pack:silent -->/, 'no output, no marker');
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('a step that never returns is killed, and the session proceeds', () => {
  const corpus = makeCorpus({
    hog: { step: 'setInterval(() => {}, 1000);' },      // never exits
    fine: { step: 'process.stdout.write("AFTER\\n");' },
  });
  const project = makeProject({ packs: ['hog', 'fine'] });
  try {
    const out = run(corpus, project, { CLAUDINITE_PACK_STEP_TIMEOUT_MS: '700' });
    assert.match(out, /AFTER/);
    assert.match(out, /hog/);
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('a runaway step cannot eat the context window', () => {
  // The one real foot-gun of letting packs write into context. The cap is the
  // answer, and it is visible: truncated output says so rather than trailing off.
  const corpus = makeCorpus({ firehose: { step: 'process.stdout.write("x".repeat(200000));' } });
  const project = makeProject({ packs: ['firehose'] });
  try {
    const out = run(corpus, project, { CLAUDINITE_PACK_STEP_MAX_BYTES: '1000' });
    assert.ok(out.length < 5000, `expected a capped injection, got ${out.length} bytes`);
    assert.match(out, /truncated/i);
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('no declaration, or no active pack, means silence', () => {
  const corpus = makeCorpus({ alpha: { step: 'process.stdout.write("NOPE\\n");' } });
  const bare = mkdtempSync(join(tmpdir(), 'claudinite-bare-'));
  const none = makeProject({ packs: [] });
  try {
    assert.equal(run(corpus, bare).trim(), '');
    assert.equal(run(corpus, none).trim(), '');
  } finally {
    rmSync(corpus, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
    rmSync(none, { recursive: true, force: true });
  }
});

test('facet lines address the summary step, not the reader: lifted out, appended to the channel', () => {
  const corpus = makeCorpus({
    alpha: { step: 'process.stdout.write("BEFORE\\nCLAUDINITE-FACET: 7 shrubberies\\nAFTER\\n");' },
    beta: { step: 'process.stdout.write("CLAUDINITE-FACET: 2 herrings\\n");' },
  });
  const project = makeProject({ packs: ['alpha', 'beta'] });
  const channel = join(project, 'facets');
  try {
    const out = run(corpus, project, { CLAUDINITE_SESSION_FACETS: channel });
    // The reader sees the step's contribution with the facet line gone...
    assert.match(out, /<!-- pack:alpha -->\nBEFORE\nAFTER/);
    assert.doesNotMatch(out, /CLAUDINITE-FACET|shrubberies|herrings/);
    // ...and beta, which said ONLY a facet, contributes no marker at all.
    assert.doesNotMatch(out, /pack:beta/);
    assert.equal(readFileSync(channel, 'utf8'), '7 shrubberies\n2 herrings\n');
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('no channel configured drops the facet and leaves the contribution whole', () => {
  const corpus = makeCorpus({ alpha: { step: 'process.stdout.write("CLAUDINITE-FACET: 1 grail\\nKEPT\\n");' } });
  const project = makeProject({ packs: ['alpha'] });
  try {
    const out = run(corpus, project);
    assert.match(out, /KEPT/);
    assert.doesNotMatch(out, /grail/);
  } finally { rmSync(corpus, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});
