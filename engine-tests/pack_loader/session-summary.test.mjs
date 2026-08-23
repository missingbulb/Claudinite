import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, cpSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { removeTree } from '../../engine/remove-tree.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The SESSION SUMMARY step: the one line a session opens with, stating what
// actually loaded — active packs, their checks, the token weight of the prose
// injected, the skills mounted. It exists because every other session-start step
// reports that the MACHINERY ran; none of them says how much landed, which is the
// only part a person can sanity-check.
//
// The contract under test is generic: count what is active, let a pack add one
// facet of its own through its manifest, and never fail a session. Core names no
// pack to get a facet, so the fixtures below are nonsense packs, deliberately.
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
  // Where a member's settings live: the loader resolves the declaration through it.
  cpSync(join(REPO_ROOT, 'engine', 'settings-file.mjs'), join(root, 'engine', 'settings-file.mjs'));
  for (const [id, { proseText, manifestSource, ...manifest }] of Object.entries(packs)) {
    const dir = join(root, 'packs', id);
    mkdirSync(dir, { recursive: true });
    const base = { id, detect: null, worldRules: [], ruleRoutingGuidance: { belongs: `whatever ${id} owns`, excludes: `whatever ${id} does not own` }, ...manifest };
    writeFileSync(
      join(dir, 'pack.mjs'),
      manifestSource
        ? manifestSource(JSON.stringify(base))
        : `export default ${JSON.stringify(base)};\n`,
    );
    if (proseText !== undefined) writeFileSync(join(dir, base.prose ?? 'RULES.md'), proseText);
  }
  return root;
}

function makeProject(declaration) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-proj-'));
  writeFileSync(join(root, '.claudinite-settings.json'), `${JSON.stringify(declaration, null, 2)}\n`);
  return root;
}

function run(corpus, project, env = {}) {
  const r = spawnSync('node', [join(corpus, 'engine', 'pack_loader', 'session-summary.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env },
  });
  // A non-zero exit makes Claude Code DISCARD the orchestrator's whole stdout, so
  // this step may never produce one — whatever it found.
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

// A rule needs only an id and a run to be a rule (pack-schema's isRuleArray), and
// the manifest is JSON-serialized into the fixture — so rules arrive as source.
const rules = (n) => ({ manifestSource: (json) => `const rules = ${JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `r${i}` })))}.map((r) => ({ ...r, run: () => {} }));\nexport default { ...${json}, workRules: rules };\n` });

// Prose is estimated through WORDS (roughly 0.75 of them per token), so a fixture
// says how many words it is, not how many bytes.
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}${i % 12 === 11 ? '\n' : ''}`).join(' ');

test('counts the active packs, their checks and their prose, and says so in one line', () => {
  const corpus = makeCorpus({
    alpha: { prose: 'RULES.md', proseText: words(1500), ...rules(3) },
    beta: { prose: 'RULES.md', proseText: words(750), ...rules(2) },
    gamma: { prose: 'RULES.md', proseText: words(90000), ...rules(9) },
  });
  const project = makeProject({ packs: ['alpha', 'beta'] });
  try {
    const out = run(corpus, project);
    // gamma is not declared, so nothing of gamma's is counted.
    assert.match(out, /Claudinite loaded, 2 packs, 5 checks, 3,000 rule tokens, 0 available skills\./);
  } finally { removeTree(corpus); removeTree(project); }
});

test('counts the mounted skill set from the registry, not the mount directory', () => {
  const corpus = makeCorpus({ alpha: { skills: ['one', 'two'] }, beta: { skills: ['two'] } });
  for (const [id, names] of [['alpha', ['one', 'two']], ['beta', ['two']]]) {
    for (const name of names) {
      mkdirSync(join(corpus, 'packs', id, 'skills', name), { recursive: true });
      writeFileSync(join(corpus, 'packs', id, 'skills', name, 'SKILL.md'), '# skill\n');
    }
  }
  const project = makeProject({ packs: ['alpha', 'beta'] });
  try {
    // "two" is bundled by both packs and mounts once — the union, not the sum.
    assert.match(run(corpus, project), /2 available skills\./);
  } finally { removeTree(corpus); removeTree(project); }
});

test('appends whatever the packs said on the facet channel, in the order stated', () => {
  const corpus = makeCorpus({ alpha: {}, beta: {} });
  const project = makeProject({ packs: ['alpha', 'beta'] });
  const channel = join(project, 'facets');
  writeFileSync(channel, '7 shrubberies\n2 herrings\n');
  try {
    assert.match(run(corpus, project, { CLAUDINITE_SESSION_FACETS: channel }), /0 available skills, 7 shrubberies, 2 herrings\./);
  } finally { removeTree(corpus); removeTree(project); }
});

test('a channel that is absent or empty leaves the engine facets standing alone', () => {
  const corpus = makeCorpus({ alpha: {}, beta: {}, gamma: {} });
  const project = makeProject({ packs: ['alpha', 'beta', 'gamma'] });
  try {
    const missing = run(corpus, project, { CLAUDINITE_SESSION_FACETS: join(project, 'never-written') });
    assert.match(missing, /3 packs, 0 checks, 0 rule tokens, 0 available skills\./);
    writeFileSync(join(project, 'facets'), '\n\n');
    assert.match(run(corpus, project, { CLAUDINITE_SESSION_FACETS: join(project, 'facets') }), /0 available skills\./);
  } finally { removeTree(corpus); removeTree(project); }
});

// The directive is read by a model that has just been handed several lines and must
// pick one. Every property below exists because the obvious phrasing loses that pick:
// a session that was told to repeat "that line" opened its reply with the sentence
// carrying those words, which was the last line it had been given.
test('directs the session to open its first reply with the summary line, unambiguously', () => {
  const corpus = makeCorpus({ alpha: {} });
  const project = makeProject({ packs: ['alpha'] });
  try {
    const out = run(corpus, project);
    // The summary appears once: two copies are two candidates to choose between.
    assert.equal(out.match(/Claudinite loaded,/g).length, 1);
    // The directive disclaims itself, so the sentence cannot read as the thing to say.
    assert.match(out, /not text to repeat/i);
    // No deixis: nothing points at a line the reader has to resolve for itself.
    assert.doesNotMatch(out, /\bthat line\b/i);
    // And the line to say is what the directive ends on — last in, first out.
    assert.match(out.trimEnd(), /:\n+Claudinite loaded, 1 pack, 0 checks, 0 rule tokens, 0 available skills\.$/);
  } finally { removeTree(corpus); removeTree(project); }
});

test('a repo that declares no pack runs no Claudinite, and hears nothing', () => {
  const corpus = makeCorpus({ alpha: {} });
  const project = makeProject({ packs: [] });
  try {
    assert.equal(run(corpus, project).trim(), '');
  } finally { removeTree(corpus); removeTree(project); }
});
