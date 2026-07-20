import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from './helpers.mjs';

const RUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'run.mjs');

function runCli(root, ...args) {
  return spawnSync(process.execPath, [RUN, ...args], { cwd: root, encoding: 'utf8' });
}

test('exit 1 with a rendered finding on a blocking violation; exit 0 when clean', () => {
  const basics = { '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }) };
  const bad = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n', ...basics } });
  const good = makeRepo({ changed: { 'doc.md': '[ok](README.md)\n', ...basics } });
  try {
    const r = runCli(bad);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /reference-integrity/);
    assert.match(r.stdout, /missing\.md/);
    assert.match(r.stdout, /Fix:/);
    assert.equal(runCli(good).status, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('advisory findings alone do not fail the run', () => {
  const root = makeRepo({
    base: {
      'deep/far/util.mjs': 'export const x = 1;\n',
      '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
    },
    changed: { 'src/mod.mjs': "import { x } from '../deep/far/util.mjs';\nexport { x };\n" },
  });
  try {
    const r = runCli(root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /file-placement/);
  } finally { cleanup(root); }
});

test('a new suppression marker blocks the run (fail fast)', () => {
  const root = makeRepo({
    changed: {
      'a.js': '// eslint-disable-next-line no-undef\ny();\n',
      '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
    },
  });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /warning-suppression/);
  } finally { cleanup(root); }
});

test('interview: a stale answer is advisory (never run-failing); pending questions are no finding at all', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({
    // barriers declares the `goals` question: `old-id` is stale, and `goals`
    // itself stays unanswered — which must NOT surface in the sweep (an
    // unattended nightly run can't answer it; only SessionStart may nudge).
    packs: [{ id: 'barriers', answers: { 'old-id': 'kept intent' } }],
  }) } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /stores an answer for "old-id"/);
    assert.doesNotMatch(r.stdout, /goals/);
  } finally { cleanup(root); }
});

test('interview: a local pack with a malformed questions declaration is a blocking config finding', () => {
  const root = makeRepo({ changed: {
    '.claudinite/local_packs/badq/pack.mjs': 'export default { id: "badq", questions: "nope" };\n',
    '.claudinite-checks.json': JSON.stringify({ packs: ['badq'] }),
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /non-array "questions"/);
  } finally { cleanup(root); }
});

test('settings validity: an unknown pack name is a blocking config error', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: ['no-such-pack'] }) } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /config/);
    assert.match(r.stdout, /unknown pack "no-such-pack"/);
  } finally { cleanup(root); }
});

test('settings validity: an unknown top-level property is a blocking config error', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: ['basics'], nonsense: 1 }) } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /unknown setting "nonsense"/);
  } finally { cleanup(root); }
});

test('settings validity: malformed JSON is a blocking config error', () => {
  const root = makeRepo({ changed: { '.claudinite-checks.json': '{ "packs": [ ' } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not valid JSON/);
  } finally { cleanup(root); }
});

test('an acceptance with a reason silences its finding; without a reason it is itself a finding', () => {
  const accepted = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: ['basics'],
        accept: [{ rule: 'reference-integrity', path: 'doc.md', reason: 'target lands in the next PR' }],
      }),
    },
  });
  const reasonless = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: ['basics'],
        accept: [{ rule: 'reference-integrity', path: 'doc.md' }],
      }),
    },
  });
  try {
    assert.equal(runCli(accepted).status, 0);
    const r = runCli(reasonless);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /reason/);
  } finally { cleanup(accepted); cleanup(reasonless); }
});

test('an acceptance path ending in "/" covers the whole subtree', () => {
  const root = makeRepo({
    changed: {
      'docs/a.md': '[gone](missing.md)\n',
      'docs/deep/b.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: ['basics'],
        accept: [{ rule: 'reference-integrity', path: 'docs/', reason: 'targets land in a follow-up PR' }],
      }),
    },
  });
  try {
    assert.equal(runCli(root).status, 0);
  } finally { cleanup(root); }
});

test('a pack entry object declares the pack and carries its own accept/rules', () => {
  // Declaring via an entry object activates the pack like a bare id, and the
  // entry's accept/rules apply — with the reasonless-acceptance finding naming
  // the entry as the exception's provenance.
  const accepted = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: [{ id: 'basics', accept: [{ rule: 'reference-integrity', path: 'doc.md', reason: 'target lands in the next PR' }] }],
      }),
    },
  });
  const reasonless = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: [{ id: 'basics', accept: [{ rule: 'reference-integrity', path: 'doc.md' }] }],
      }),
    },
  });
  const overridden = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({
        packs: [{ id: 'basics', rules: { 'reference-integrity': 'advisory' } }],
      }),
    },
  });
  try {
    assert.equal(runCli(accepted).status, 0);
    const r = runCli(reasonless);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /on the "basics" pack entry.*has no reason/);
    assert.equal(runCli(overridden).status, 0);
  } finally { cleanup(accepted); cleanup(reasonless); cleanup(overridden); }
});

test('settings validity: an unknown pack name in an entry object, and conflicting overrides, are blocking config errors', () => {
  const unknown = makeRepo({ changed: { '.claudinite-checks.json': JSON.stringify({ packs: [{ id: 'no-such-pack' }] }) } });
  const conflicted = makeRepo({
    changed: {
      '.claudinite-checks.json': JSON.stringify({
        packs: [{ id: 'basics', rules: { 'reference-integrity': 'advisory' } }],
        rules: { 'reference-integrity': 'off' },
      }),
    },
  });
  try {
    const u = runCli(unknown);
    assert.equal(u.status, 1);
    assert.match(u.stdout, /unknown pack "no-such-pack"/);
    const c = runCli(conflicted);
    assert.equal(c.status, 1);
    assert.match(c.stdout, /rule "reference-integrity" is set to "off" by the top-level "rules" and "advisory" by the "basics" pack entry/);
  } finally { cleanup(unknown); cleanup(conflicted); }
});

test('severity override in config demotes a blocking rule to advisory', () => {
  const root = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-checks.json': JSON.stringify({ packs: ['basics'], rules: { 'reference-integrity': 'advisory' } }),
    },
  });
  try {
    assert.equal(runCli(root).status, 0);
  } finally { cleanup(root); }
});

test('--list emits the machine-readable rule catalog', () => {
  const root = makeRepo({ changed: {} });
  try {
    const r = runCli(root, '--list');
    assert.equal(r.status, 0);
    for (const id of ['reference-integrity', 'markdown-link-labels', 'task-lifecycle',
                      'warning-suppression', 'file-placement', 'skill-ownership',
                      'squash-merge-history']) {
      assert.match(r.stdout, new RegExp(`^${id}\t`, 'm'));
    }
  } finally { cleanup(root); }
});

test("a pack's rules run only when it is declared", () => {
  // A marker (here a workflow) only suspects a pack is wanted — it never forces
  // one. So an undeclared github-actions pack stays silent (its rules don't run),
  // and declaring it turns them on. Whether to declare is the project's call.
  const wf = { '.github/workflows/x.yml': 'name: x\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    if: ${{ secrets.T }}\n    steps:\n      - run: echo hi\n' };
  const undeclared = makeRepo({
    changed: { ...wf, '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }) },
  });
  const declared = makeRepo({
    changed: { ...wf, '.claudinite-checks.json': JSON.stringify({ packs: ['basics', 'github-actions'] }) },
  });
  try {
    const u = runCli(undeclared);
    assert.equal(u.status, 0);              // gha rules don't run undeclared → clean
    assert.doesNotMatch(u.stdout, /gha\//);
    const d = runCli(declared);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /gha\/secrets-in-job-if/);
  } finally { cleanup(undeclared); cleanup(declared); }
});

test('--init writes the pack declaration once and is idempotent', () => {
  const root = makeRepo({ changed: {} });
  try {
    assert.equal(runCli(root, '--init').status, 0);
    assert.ok(existsSync(join(root, '.claudinite-checks.json')));
    const first = readFileSync(join(root, '.claudinite-checks.json'), 'utf8');
    // No pack is active by default, so --init materializes the seeded-by-default
    // declared packs: basics plus grow_with_claudinite and tidy-repo (opt-out by
    // removal) — and the requires closure: basics pulls the barriers mechanism
    // pack in, materialized with its provenance (`via`).
    assert.deepEqual(JSON.parse(first).packs,
      ['basics', { id: 'barriers', via: ['basics'] }, 'grow_with_claudinite', 'tidy-repo']);
    // The delivery selection is materialized, never an implicit default.
    assert.equal(JSON.parse(first).maintenance.delivery, 'auto');
    assert.equal(runCli(root, '--init').status, 0);
    assert.equal(readFileSync(join(root, '.claudinite-checks.json'), 'utf8'), first);
  } finally { cleanup(root); }
});

test('the contributedRules seam: a pack\'s contributed barrier runs via the runner, under its own id', () => {
  // product-wiki contributes its isolation wall to the barriers pack as
  // manifest data; the runner hands barriers the active-pack list and the
  // contribution runs as a first-class rule — no cross-pack import anywhere.
  const root = makeRepo({ changed: {
    'product-wiki/Users/README.md': '# Users\n',
    'dev/notes.md': 'see product-wiki/Users/README.md\n',
    '.claudinite-checks.json': JSON.stringify({ packs: ['product-wiki', 'barriers'] }),
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /product-wiki-isolation\s+dev\/notes\.md/);
  } finally { cleanup(root); }
});

test('no pack runs undeclared — basics included', () => {
  // Same blocking violation as above, but nothing declared: the baseline is
  // explicit opt-in, so the run stays silent and green.
  const bare = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n' } });
  const empty = makeRepo({ changed: {
    'doc.md': '[gone](missing.md)\n',
    '.claudinite-checks.json': JSON.stringify({ packs: [] }),
  } });
  try {
    for (const root of [bare, empty]) {
      const r = runCli(root);
      assert.equal(r.status, 0);
      assert.doesNotMatch(r.stdout, /reference-integrity/);
    }
  } finally { cleanup(bare); cleanup(empty); }
});

test('a skill-owned check is discovered and run through the CLI, and listed', () => {
  const root = makeRepo({ changed: {
    'dev/routines/demo/routine.md': 'Run `bash dev/routines/demo/preconditions.sh`.\n',
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1); // routine-structure lives in skills/, not a pack, yet still runs
    assert.match(r.stdout, /routine-structure/);
    assert.match(runCli(root, '--list').stdout, /^routine-structure\t/m);
  } finally { cleanup(root); }
});

// --- local packs (.claudinite/local_packs/) -------------------------------

// A pack.mjs whose one rule fires on a marker file, dependency-free (a real
// local pack's checks can't import the gitignored mount's helpers).
const LOCAL_PACK = `export default {
  id: 'proj', prose: 'RULES.md', skills: [],
  rules: [{
    id: 'no-todo-marker', severity: 'blocking',
    description: 'no TODO_MARKER files', doc: '.claudinite/local_packs/proj/RULES.md',
    why: 'demo local check',
    run(ctx) {
      return ctx.files.filter((f) => f.endsWith('TODO_MARKER')).map((f) => ({
        rule: 'no-todo-marker', severity: 'blocking', file: f, line: null,
        what: 'TODO_MARKER present', why: 'demo', fix: 'remove it',
        doc: '.claudinite/local_packs/proj/RULES.md',
      }));
    },
  }],
};`;

test('a declared local pack is valid and its check runs when active', () => {
  const clean = makeRepo({ changed: {
    '.claudinite/local_packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-checks.json': JSON.stringify({ packs: ['proj'] }),
  } });
  const dirty = makeRepo({ changed: {
    '.claudinite/local_packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-checks.json': JSON.stringify({ packs: ['proj'] }),
    'src/TODO_MARKER': 'x\n',
  } });
  try {
    // declaring the local pack id is NOT an unknown-pack error
    const c = runCli(clean);
    assert.doesNotMatch(c.stdout, /unknown pack/);
    assert.equal(c.status, 0);
    // and its check fires on a violating file
    const d = runCli(dirty);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /no-todo-marker/);
    assert.match(d.stdout, /TODO_MARKER present/);
  } finally { cleanup(clean); cleanup(dirty); }
});

test('a local pack declared by its namespaced token local_packs/<name> validates and runs', () => {
  const clean = makeRepo({ changed: {
    '.claudinite/local_packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-checks.json': JSON.stringify({ packs: ['local_packs/proj'] }),
  } });
  const dirty = makeRepo({ changed: {
    '.claudinite/local_packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-checks.json': JSON.stringify({ packs: ['local_packs/proj'] }),
    'src/TODO_MARKER': 'x\n',
  } });
  try {
    // the namespaced token resolves to the known bare id — no unknown-pack error
    const c = runCli(clean);
    assert.doesNotMatch(c.stdout, /unknown pack/);
    assert.equal(c.status, 0, c.stdout);
    // and it activates the pack exactly like the bare form
    const d = runCli(dirty);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /no-todo-marker/);
  } finally { cleanup(clean); cleanup(dirty); }
});

test('an undeclared local pack does not run, but is not an unknown-pack error either', () => {
  const root = makeRepo({ changed: {
    '.claudinite/local_packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
    'src/TODO_MARKER': 'x\n',
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 0, r.stdout);
    assert.doesNotMatch(r.stdout, /no-todo-marker/); // present but undeclared → inert
  } finally { cleanup(root); }
});

test('a broken local pack.mjs surfaces a blocking config diagnostic, not a silent drop', () => {
  const root = makeRepo({ changed: {
    '.claudinite/local_packs/broken/pack.mjs': 'export default { id: "broken" } this is not valid(',
    '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /config/);
    assert.match(r.stdout, /local_packs\/broken|failed to load/);
  } finally { cleanup(root); }
});

test('a local pack may not shadow a canon id — collision is a blocking config error', () => {
  const root = makeRepo({ changed: {
    '.claudinite/local_packs/basics/pack.mjs': 'export default { id: "basics", rules: [] };',
    '.claudinite-checks.json': JSON.stringify({ packs: ['basics'] }),
  } });
  try {
    const r = runCli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /declared twice/);
  } finally { cleanup(root); }
});
