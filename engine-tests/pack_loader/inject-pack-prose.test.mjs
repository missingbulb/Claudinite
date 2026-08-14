import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeRepo, cleanup } from '../helpers.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A fake corpus with the REAL registry and the REAL inject script copied in
// verbatim — the script self-locates via import.meta.url, so running the copy
// derives everything from the fake packs, no test-only knobs in the script.
// Each pack carries its prose RULES.md beside its pack.mjs (the one shape).
function makeCorpus({ packs }, root = mkdtempSync(join(tmpdir(), 'claudinite-corpus-'))) {
  mkdirSync(join(root, 'packs'), { recursive: true });
  mkdirSync(join(root, 'engine', 'pack_loader'), { recursive: true });
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-registry.mjs'), join(root, 'engine', 'pack_loader', 'pack-registry.mjs'));
  // The registry validates every manifest against the spec, so the fake corpus
  // needs the spec module too — it is part of the loader, not an optional extra.
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'pack-schema.mjs'), join(root, 'engine', 'pack_loader', 'pack-schema.mjs'));
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'inject-pack-prose.mjs'), join(root, 'engine', 'pack_loader', 'inject-pack-prose.mjs'));
  // The injector now asks whether the CLAUDE.md channel is carrying the corpus
  // before it emits any (#807), so the generator that answers that question is part
  // of the loader the fake corpus needs.
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'generate-claude-index.mjs'), join(root, 'engine', 'pack_loader', 'generate-claude-index.mjs'));
  for (const [id, manifest] of Object.entries(packs)) {
    // The def IS the pack.mjs manifest (an optional `prose: '<file>'` field and
    // whatever else); each test writes the prose file's content itself.
    mkdirSync(join(root, 'packs', id), { recursive: true });
    writeFileSync(
      join(root, 'packs', id, 'pack.mjs'),
      `export default ${JSON.stringify({ id, detect: null, worldRules: [], ruleRoutingGuidance: { belongs: `whatever ${id} owns`, excludes: `whatever ${id} does not own` }, ...manifest })};\n`
    );
  }
  return root;
}

function inject(corpus, project) {
  const r = spawnSync('node', [join(corpus, 'engine', 'pack_loader', 'inject-pack-prose.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
  assert.equal(r.status, 0, r.stderr); // fail-soft: the hook must never exit non-zero
  return r.stdout;
}

test('inject-pack-prose: emits the prose of every declared pack, nothing else', () => {
  const corpus = makeCorpus({
    packs: {
      basics: { prose: 'RULES.md' },
      tech: { prose: 'RULES.md' },
      other: { prose: 'RULES.md' },
      bare: {}, // an active pack with no prose contributes nothing
    },
  });
  // Give each prose file distinctive content.
  writeFileSync(join(corpus, 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');
  writeFileSync(join(corpus, 'packs', 'tech', 'RULES.md'), 'TECH PROSE\n');
  writeFileSync(join(corpus, 'packs', 'other', 'RULES.md'), 'OTHER PROSE\n');

  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["basics", "tech", "bare"] }\n' },
  });
  try {
    const out = inject(corpus, project);
    // The declared packs' prose is injected, under the guidance header.
    assert.match(out, /# Claudinite — active-pack guidance/);
    assert.match(out, /<!-- pack:basics -->\nBASICS PROSE/);
    assert.match(out, /<!-- pack:tech -->\nTECH PROSE/);
    // An undeclared pack's prose must not leak in.
    assert.doesNotMatch(out, /OTHER PROSE/);
    assert.doesNotMatch(out, /pack:other/);
    // An active but prose-less pack contributes no section.
    assert.doesNotMatch(out, /pack:bare/);
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('inject-pack-prose: a pack declared as an entry object loads like a bare id', () => {
  const corpus = makeCorpus({ packs: { basics: { prose: 'RULES.md' } } });
  writeFileSync(join(corpus, 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');
  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": [{ "id": "basics", "config": { "x": 1 } }] }\n' },
  });
  try {
    assert.match(inject(corpus, project), /BASICS PROSE/);
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('inject-pack-prose: loads a local pack\'s RULES.md from the project\'s own tree', () => {
  const corpus = makeCorpus({ packs: { basics: { prose: 'RULES.md' } } });
  writeFileSync(join(corpus, 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');
  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["basics", "proj"] }\n' },
  });
  try {
    // The project's own local pack bundles its own prose; it must load off the
    // pack's OWN directory (local_packs/), not a single shared root.
    const packDir = join(project, '.claudinite', 'local_packs', 'proj');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', rules: [], prose: 'RULES.md' };\n`);
    writeFileSync(join(packDir, 'RULES.md'), 'LOCAL PROSE\n');

    const out = inject(corpus, project);
    assert.match(out, /<!-- pack:basics -->\nBASICS PROSE/);
    assert.match(out, /<!-- pack:proj -->\nLOCAL PROSE/);
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('inject-pack-prose: the routing table points at the full pack directory when the corpus carries it', () => {
  const corpus = makeCorpus({ packs: { basics: { prose: 'RULES.md' } } });
  writeFileSync(join(corpus, 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');
  writeFileSync(join(corpus, 'packs', 'directory.GENERATED.md'), 'stub catalog\n');
  const project = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": ["basics"] }\n' } });
  try {
    const out = inject(corpus, project);
    assert.match(out, /directory\.GENERATED\.md/,
      'a session deciding what to adopt must be pointed at the full directory of adoptable packs');
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('inject-pack-prose: no pointer when the mount predates the pack directory', () => {
  const corpus = makeCorpus({ packs: { basics: { prose: 'RULES.md' } } });
  writeFileSync(join(corpus, 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');
  const project = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": ["basics"] }\n' } });
  try {
    assert.doesNotMatch(inject(corpus, project), /directory\.GENERATED\.md/,
      'an older mount without the catalog must not be pointed at a file that is not there');
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('inject-pack-prose: fails soft — no config, broken config, and no active pack each emit nothing', () => {
  const corpus = makeCorpus({ packs: { basics: { prose: 'RULES.md' } } });
  writeFileSync(join(corpus, 'packs', 'basics', 'RULES.md'), 'BASICS PROSE\n');

  // No config at all.
  const empty = makeRepo({ base: { 'README.md': 'seed\n' } });
  // Broken (non-JSON) config.
  const broken = makeRepo({ changed: { '.claudinite-checks.json': 'not json' } });
  // Valid config declaring nothing active.
  const inactive = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": [] }\n' } });
  try {
    for (const p of [empty, broken, inactive]) {
      assert.equal(inject(corpus, p), '', 'a fail-soft path emits no section');
    }
  } finally {
    rmSync(corpus, { recursive: true, force: true });
    for (const p of [empty, broken, inactive]) cleanup(p);
  }
});

// --- the CLAUDE.md channel (#807) ---------------------------------------------
//
// The corpus rides `.claudinite/claude.GENERATED.md` now, imported by the repo's
// CLAUDE.md. This step's whole remaining job is deciding whether that channel is
// really carrying it — so these tests are about the DECISION, not the prose.

// A project with the corpus MOUNTED INSIDE IT at .claudinite/shared/, which is the
// layout the index's relative imports are computed against — the detached fake corpus
// the other tests use has no mount, so the generator would resolve nothing there.
function makeMountedProject(packs, prose) {
  const project = makeRepo({ changed: { '.claudinite-checks.json': `{ "packs": ${JSON.stringify(Object.keys(packs))} }\n` } });
  const corpus = join(project, '.claudinite', 'shared');
  mkdirSync(corpus, { recursive: true });
  makeCorpus({ packs }, corpus);
  for (const [id, text] of Object.entries(prose)) writeFileSync(join(corpus, 'packs', id, 'RULES.md'), text);
  return { project, corpus };
}

// Wire a project for the CLAUDE.md channel the way a converge would: the index the
// generator renders for this project, plus the import line in CLAUDE.md. The
// overrides are how each drift case below is introduced.
function wireClaudeChannel(corpus, project, { claudeMd, index } = {}) {
  const r = spawnSync('node', [join(corpus, 'engine', 'pack_loader', 'generate-claude-index.mjs'), project], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('@shared/packs/'), `the fixture must render a real index:\n${r.stdout}`);
  mkdirSync(join(project, '.claudinite'), { recursive: true });
  writeFileSync(join(project, '.claudinite', 'claude.GENERATED.md'), index ?? r.stdout);
  writeFileSync(join(project, 'CLAUDE.md'), claudeMd ?? '@.claudinite/claude.GENERATED.md\n');
  return r.stdout;
}

const MOUNTED = [{ basics: { prose: 'RULES.md' } }, { basics: 'BASICS PROSE\n' }];

test('inject-pack-prose: stays silent when CLAUDE.md verifiably carries the corpus', () => {
  const { project, corpus } = makeMountedProject(...MOUNTED);
  try {
    wireClaudeChannel(corpus, project);
    const out = inject(corpus, project);
    // Not one byte of corpus on the hook channel — that duplication is the cost
    // this change exists to remove.
    assert.doesNotMatch(out, /BASICS PROSE/);
    assert.doesNotMatch(out, /# Claudinite — active-pack guidance/);
    // But not silence either: a session must be able to see WHERE its rules came
    // from, or a step that deferred looks exactly like a step that failed.
    assert.match(out, /claude\.GENERATED\.md/);
  } finally { cleanup(project); }
});

test('inject-pack-prose: falls back to injecting when the index is stale, quoted, unimported or absent', () => {
  // Each project is wired for the channel, then broken one way. Every case must
  // inject: a repo is never left with the corpus on neither channel.
  const cases = {
    // A pack declared since the last converge renders a different index — the exact
    // drift an existence check would call healthy.
    stale: { index: '# an index from before the last pack change\n' },
    // An import inside backticks is one the harness skips, so a CLAUDE.md that only
    // documents the line imports nothing.
    quoted: { claudeMd: 'Claudinite is loaded via `@.claudinite/claude.GENERATED.md`.\n' },
    // No import line at all — a hand-edited or never-converged CLAUDE.md.
    unimported: { claudeMd: '# Project\n\nnothing about Claudinite\n' },
  };
  const projects = [];
  try {
    for (const [name, broken] of Object.entries(cases)) {
      const { project, corpus } = makeMountedProject(...MOUNTED);
      projects.push(project);
      wireClaudeChannel(corpus, project, broken);
      const out = inject(corpus, project);
      assert.match(out, /BASICS PROSE/, `${name}: the corpus must still reach the session`);
      // And the fallback says so FIRST — everything after it is what #807 showed a
      // large payload can lose without trace, so the line reporting the drift has to
      // sit where a truncated delivery still keeps it.
      assert.match(out.split('\n')[0], /^NOTE: this repo's CLAUDE\.md is not carrying/, `${name}: ${out.slice(0, 120)}`);
    }
    // An import pointing at an index that is not there.
    const { project, corpus } = makeMountedProject(...MOUNTED);
    projects.push(project);
    writeFileSync(join(project, 'CLAUDE.md'), '@.claudinite/claude.GENERATED.md\n');
    assert.match(inject(corpus, project), /BASICS PROSE/, 'an imported-but-absent index must not silence the hook');
  } finally { for (const p of projects) cleanup(p); }
});

// The real corpus, against the REAL registry filename — the direct guard for
// the #-injection path this file protects: the script must import the module by
// its actual name (pack-registry.mjs). A wrong import specifier throws, the
// fail-soft catch swallows it, and every active pack's prose silently vanishes
// fleet-wide — so a green "exit 0" is not enough; the prose must actually appear.
test('inject-pack-prose: the real corpus injects the basics prose into a consumer', () => {
  const project = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": ["basics"] }\n' } });
  try {
    const r = spawnSync('node', [join(REPO_ROOT, 'engine', 'pack_loader', 'inject-pack-prose.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /# Claudinite — active-pack guidance/,
      'the real registry must import and the basics prose must be injected');
    assert.match(r.stdout, /<!-- pack:basics -->/);
  } finally { cleanup(project); }
});
