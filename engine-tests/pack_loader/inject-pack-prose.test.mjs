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
  copyFileSync(join(REPO_ROOT, 'engine', 'pack_loader', 'inject-pack-prose.mjs'), join(root, 'engine', 'pack_loader', 'inject-pack-prose.mjs'));
  for (const [id, manifest] of Object.entries(packs)) {
    // The def IS the pack.mjs manifest (an optional `prose: '<file>'` field and
    // whatever else); each test writes the prose file's content itself.
    mkdirSync(join(root, 'packs', id), { recursive: true });
    writeFileSync(
      join(root, 'packs', id, 'pack.mjs'),
      `export default ${JSON.stringify({ id, detect: null, rules: [], ...manifest })};\n`
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
