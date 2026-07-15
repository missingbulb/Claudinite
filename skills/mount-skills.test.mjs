import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  existsSync, lstatSync, readlinkSync, realpathSync, symlinkSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeRepo, cleanup, git } from '../checks/test/helpers.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A fake corpus with the REAL registry and the REAL mount script copied in
// verbatim — the script self-locates via import.meta.url, so running the copy
// derives everything from the fake packs, no test-only knobs in the script.
function makeCorpus({ packs, skills }) {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-corpus-'));
  mkdirSync(join(root, 'packs'), { recursive: true });
  mkdirSync(join(root, 'skills'), { recursive: true });
  copyFileSync(join(REPO_ROOT, 'packs', 'registry.mjs'), join(root, 'packs', 'registry.mjs'));
  copyFileSync(join(REPO_ROOT, 'skills', 'mount-skills.mjs'), join(root, 'skills', 'mount-skills.mjs'));
  for (const [id, def] of Object.entries(packs)) {
    mkdirSync(join(root, 'packs', id));
    writeFileSync(
      join(root, 'packs', id, 'pack.mjs'),
      `export default ${JSON.stringify({ id, detect: null, rules: [], ...def })};\n`
    );
  }
  for (const name of skills) {
    mkdirSync(join(root, 'skills', name));
    writeFileSync(join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\nbody\n`);
  }
  return root;
}

function mount(corpus, project) {
  const r = spawnSync('node', [join(corpus, 'skills', 'mount-skills.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
  });
  assert.equal(r.status, 0, r.stderr);
  return r;
}

// No pack is active by default — the fake baseline is declared like any other.
const CORPUS = {
  packs: {
    basics: { skills: ['base-skill'] },
    tech: { skills: ['tech-skill', 'shared-skill'] },
    other: { skills: ['other-skill', 'shared-skill'] },
  },
  skills: ['base-skill', 'tech-skill', 'other-skill', 'shared-skill'],
};

test('mount-skills: mounts the union of the declared packs, nothing more', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["basics", "tech"] }\n' },
  });
  try {
    mount(corpus, project);
    for (const name of ['base-skill', 'tech-skill', 'shared-skill']) {
      const link = join(project, '.claude', 'skills', name);
      assert.ok(lstatSync(link).isSymbolicLink(), `${name} should be a symlink`);
      assert.equal(realpathSync(link), realpathSync(join(corpus, 'skills', name)));
    }
    assert.ok(!existsSync(join(project, '.claude', 'skills', 'other-skill')),
      'an undeclared pack\'s skill must not mount');
    const ignore = readFileSync(join(project, '.claude', 'skills', '.gitignore'), 'utf8');
    for (const name of ['.gitignore', 'base-skill', 'tech-skill', 'shared-skill']) {
      assert.match(ignore, new RegExp(`^${name}$`, 'm'));
    }
    // The generated mounts must never dirty the tree.
    assert.equal(git(project, 'status', '--porcelain').trim(), '');
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: a pack declared as an entry object mounts like a bare id', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["basics", { "id": "tech", "config": { "x": 1 } }] }\n' },
  });
  try {
    mount(corpus, project);
    assert.ok(lstatSync(join(project, '.claude', 'skills', 'tech-skill')).isSymbolicLink());
    assert.ok(!existsSync(join(project, '.claude', 'skills', 'other-skill')));
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: re-run syncs the mounts to a changed declaration', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["basics", "tech"] }\n' },
  });
  try {
    mount(corpus, project);
    writeFileSync(join(project, '.claudinite-checks.json'), '{ "packs": ["basics"] }\n');
    mount(corpus, project);
    assert.ok(existsSync(join(project, '.claude', 'skills', 'base-skill')));
    assert.ok(!existsSync(join(project, '.claude', 'skills', 'tech-skill')),
      'an undeclared pack\'s skill must be unmounted');
    assert.ok(!existsSync(join(project, '.claude', 'skills', 'shared-skill')));
    assert.doesNotMatch(
      readFileSync(join(project, '.claude', 'skills', '.gitignore'), 'utf8'),
      /tech-skill/
    );
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: never touches entries it does not own', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": ["basics"] }\n' } });
  try {
    // The project's own skill, its own foreign symlink, and its own directory
    // shadowing a corpus skill name — all must survive untouched.
    mkdirSync(join(project, '.claude', 'skills', 'my-own'), { recursive: true });
    writeFileSync(join(project, '.claude', 'skills', 'my-own', 'SKILL.md'), 'mine\n');
    mkdirSync(join(project, '.claude', 'skills', 'base-skill'), { recursive: true });
    writeFileSync(join(project, '.claude', 'skills', 'base-skill', 'SKILL.md'), 'shadows the corpus\n');
    symlinkSync('/nonexistent-elsewhere', join(project, '.claude', 'skills', 'foreign-link'));
    mount(corpus, project);
    assert.equal(readFileSync(join(project, '.claude', 'skills', 'my-own', 'SKILL.md'), 'utf8'), 'mine\n');
    assert.equal(
      readFileSync(join(project, '.claude', 'skills', 'base-skill', 'SKILL.md'), 'utf8'),
      'shadows the corpus\n',
      'a project-owned entry wins over a corpus skill of the same name'
    );
    assert.equal(readlinkSync(join(project, '.claude', 'skills', 'foreign-link')), '/nonexistent-elsewhere');
    const ignore = readFileSync(join(project, '.claude', 'skills', '.gitignore'), 'utf8');
    assert.doesNotMatch(ignore, /my-own|foreign-link|base-skill/);
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: removes a stale owned link, is idempotent, fails soft on a broken config', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": ["basics"] }\n' } });
  try {
    // A leftover link into the corpus for a skill that no longer exists there.
    mkdirSync(join(project, '.claude', 'skills'), { recursive: true });
    symlinkSync(join(corpus, 'skills', 'retired-skill'), join(project, '.claude', 'skills', 'retired-skill'));
    mount(corpus, project);
    assert.ok(!existsSync(join(project, '.claude', 'skills', 'retired-skill')));
    const first = readFileSync(join(project, '.claude', 'skills', '.gitignore'), 'utf8');
    mount(corpus, project);
    assert.equal(readFileSync(join(project, '.claude', 'skills', '.gitignore'), 'utf8'), first);
    // A broken config must not break the session (fail-soft contract).
    writeFileSync(join(project, '.claudinite-checks.json'), 'not json');
    mount(corpus, project);
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: mounts a local pack\'s bundled skill from the tracked pack dir', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({
    changed: {
      '.claudinite-checks.json': '{ "packs": ["basics", "proj"] }\n',
    },
  });
  try {
    // The project's own local pack requires a canon skill AND bundles its own.
    const packDir = join(project, '.claudinite', 'local_packs', 'proj');
    mkdirSync(join(packDir, 'skills', 'proj-skill'), { recursive: true });
    writeFileSync(join(packDir, 'pack.mjs'),
      `export default { id: 'proj', rules: [], skills: ['base-skill', 'proj-skill'] };\n`);
    writeFileSync(join(packDir, 'skills', 'proj-skill', 'SKILL.md'), '---\nname: proj-skill\n---\nlocal\n');

    mount(corpus, project);

    // the canon skill required by the local pack still mounts from the corpus
    const baseLink = join(project, '.claude', 'skills', 'base-skill');
    assert.ok(lstatSync(baseLink).isSymbolicLink());
    assert.equal(realpathSync(baseLink), realpathSync(join(corpus, 'skills', 'base-skill')));

    // the bundled skill mounts from the tracked local pack dir
    const projLink = join(project, '.claude', 'skills', 'proj-skill');
    assert.ok(lstatSync(projLink).isSymbolicLink(), 'proj-skill should be a symlink');
    assert.equal(realpathSync(projLink), realpathSync(join(packDir, 'skills', 'proj-skill')));
    assert.ok(existsSync(join(projLink, 'SKILL.md')), 'the bundled link resolves to a real SKILL.md');

    // the generated .gitignore lists it; the local pack files stay in git status
    // (the mounts themselves must not dirty the tree)
    const ignore = readFileSync(join(project, '.claude', 'skills', '.gitignore'), 'utf8');
    assert.match(ignore, /^proj-skill$/m);
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: unmounts a local pack\'s skill when the pack is undeclared', () => {
  const corpus = makeCorpus(CORPUS);
  const project = makeRepo({
    changed: { '.claudinite-checks.json': '{ "packs": ["basics", "proj"] }\n' },
  });
  try {
    const packDir = join(project, '.claudinite', 'local_packs', 'proj');
    mkdirSync(join(packDir, 'skills', 'proj-skill'), { recursive: true });
    writeFileSync(join(packDir, 'pack.mjs'), `export default { id: 'proj', rules: [], skills: ['proj-skill'] };\n`);
    writeFileSync(join(packDir, 'skills', 'proj-skill', 'SKILL.md'), '---\nname: proj-skill\n---\nlocal\n');
    mount(corpus, project);
    assert.ok(existsSync(join(project, '.claude', 'skills', 'proj-skill')));
    // drop the local pack from the declaration — its mounted skill must go
    writeFileSync(join(project, '.claudinite-checks.json'), '{ "packs": ["basics"] }\n');
    mount(corpus, project);
    assert.ok(!existsSync(join(project, '.claude', 'skills', 'proj-skill')),
      'a local pack\'s skill unmounts once the pack is undeclared');
  } finally { rmSync(corpus, { recursive: true, force: true }); cleanup(project); }
});

test('mount-skills: the real corpus mounts every basics skill into a consumer', () => {
  const project = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": ["basics"] }\n' } });
  try {
    const r = spawnSync('node', [join(REPO_ROOT, 'skills', 'mount-skills.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    });
    assert.equal(r.status, 0, r.stderr);
    const link = join(project, '.claude', 'skills', 'merge-to-main');
    assert.ok(lstatSync(link).isSymbolicLink());
    assert.ok(existsSync(join(link, 'SKILL.md')), 'the mounted link must resolve to a real SKILL.md');
    assert.equal(git(project, 'status', '--porcelain').trim(), '');
  } finally { cleanup(project); }
});
