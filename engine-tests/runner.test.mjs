import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, runScriptInProcess } from './helpers.mjs';

const WORLD = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'checks', 'check_the_world.mjs');
const WORK = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'checks', 'check_the_work.mjs');

// Nearly every case here asserts what an entry point DOES — which findings it
// produces, the exit code it lands on, which channel each line goes to — so it
// calls the entry point in this process (`world` / `work`) instead of paying a
// node start per case. `--root` is how the fixture is named there; the spawning
// form passed it as the child's cwd, which the entry points resolve to the same
// thing (--root first, then CLAUDE_PROJECT_DIR, then cwd).
//
// The two cases that assert the PROCESS's own contract keep spawning, and say so
// at the case. Each entry point keeps one, because that contract is real: #2062
// was stdout truncated by process.exit, which only a caller reading a real pipe
// can see.
const world = (root, ...args) => runScriptInProcess(WORLD, ['--root', root, ...args]);
const work = (root, ...args) => runScriptInProcess(WORK, ['--root', root, ...args]);

function runCli(root, ...args) {
  return spawnSync(process.execPath, [WORLD, ...args], { cwd: root, encoding: 'utf8' });
}

// The work-scope entry — rules judging the change (reference-integrity below).
function runWorkCli(root, ...args) {
  return spawnSync(process.execPath, [WORK, ...args], { cwd: root, encoding: 'utf8' });
}

// SPAWNS: the work runner's process contract — a real exit status off a real
// process, and a rendered report arriving whole down a pipe. An in-process call
// reads `process.exitCode` and a captured console instead, neither of which is
// what a Stop hook or a CI step actually observes.
test('exit 1 with a rendered finding on a blocking violation; exit 0 when clean', () => {
  const basics = { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) };
  const bad = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n', ...basics } });
  const good = makeRepo({ changed: { 'doc.md': '[ok](README.md)\n', ...basics } });
  try {
    const r = runWorkCli(bad);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /reference-integrity/);
    assert.match(r.stdout, /missing\.md/);
    assert.match(r.stdout, /Fix:/);
    assert.equal(runWorkCli(good).status, 0);
  } finally { cleanup(bad); cleanup(good); }
});

test('advisory findings alone do not fail the run', async () => {
  const root = makeRepo({
    base: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) },
    changed: { 'packs/demo/RULES.md': `- ${'x'.repeat(120)}\n` },
  });
  try {
    const r = await world(root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /rules-line-length/);
  } finally { cleanup(root); }
});

test('a new suppression marker blocks the run (fail fast)', async () => {
  const root = makeRepo({
    changed: {
      'a.js': '// eslint-disable-next-line no-undef\ny();\n',
      '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }),
    },
  });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /warning-suppression/);
  } finally { cleanup(root); }
});

test('interview: a stale answer is advisory (never run-failing); pending questions are no finding at all', async () => {
  // The hygiene check is core's (bundled in the adopt-claudinite skill), so that
  // pack must be active for it to run; it inspects every active pack's answers.
  // executable-requirements declares the `ui_testing` question: `old-id` is stale,
  // and `ui_testing` itself stays unanswered — which must NOT surface in the sweep
  // (an unattended nightly run can't answer it; only SessionStart may nudge).
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({
    packs: ['claudinite-lifecycle', { id: 'executable-requirements', answers: { 'old-id': 'kept intent' } }],
  }) } });
  try {
    const r = await world(root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /stores an answer for "old-id"/);
    assert.doesNotMatch(r.stdout, /ui_testing/);
  } finally { cleanup(root); }
});

test('interview: a local pack with a malformed questions declaration is a blocking config finding', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/badq/pack.mjs': 'export default { id: "badq", questions: "nope" };\n',
    '.claudinite-settings.json': JSON.stringify({ packs: ['badq'] }),
  } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /non-array "questions"/);
  } finally { cleanup(root); }
});

test('settings validity: an unknown pack name is a blocking config error', async () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['no-such-pack'] }) } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /config/);
    assert.match(r.stdout, /unknown pack "no-such-pack"/);
  } finally { cleanup(root); }
});

test('settings validity: an unknown top-level property is a blocking config error', async () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], nonsense: 1 }) } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /unknown setting "nonsense"/);
  } finally { cleanup(root); }
});

test('settings validity: malformed JSON is a blocking config error', async () => {
  const root = makeRepo({ changed: { '.claudinite-settings.json': '{ "packs": [ ' } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not valid JSON/);
  } finally { cleanup(root); }
});

test('an acceptance with a reason silences its finding; without a reason it is itself a finding', async () => {
  const accepted = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({
        packs: ['basics'],
        accept: [{ rule: 'reference-integrity', path: 'doc.md', reason: 'target lands in the next PR' }],
      }),
    },
  });
  const reasonless = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({
        packs: ['basics'],
        accept: [{ rule: 'reference-integrity', path: 'doc.md' }],
      }),
    },
  });
  try {
    assert.equal((await work(accepted)).status, 0);
    const r = await work(reasonless);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /reason/);
  } finally { cleanup(accepted); cleanup(reasonless); }
});

test('an acceptance path ending in "/" covers the whole subtree', async () => {
  const root = makeRepo({
    changed: {
      'docs/a.md': '[gone](missing.md)\n',
      'docs/deep/b.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({
        packs: ['basics'],
        accept: [{ rule: 'reference-integrity', path: 'docs/', reason: 'targets land in a follow-up PR' }],
      }),
    },
  });
  try {
    assert.equal((await world(root)).status, 0);
  } finally { cleanup(root); }
});

test('a pack entry object declares the pack and carries its own accept/rules', async () => {
  // Declaring via an entry object activates the pack like a bare id, and the
  // entry's accept/rules apply — with the reasonless-acceptance finding naming
  // the entry as the exception's provenance.
  const accepted = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'basics', accept: [{ rule: 'reference-integrity', path: 'doc.md', reason: 'target lands in the next PR' }] }],
      }),
    },
  });
  const reasonless = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'basics', accept: [{ rule: 'reference-integrity', path: 'doc.md' }] }],
      }),
    },
  });
  const overridden = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'basics', rules: { 'reference-integrity': 'advisory' } }],
      }),
    },
  });
  try {
    assert.equal((await work(accepted)).status, 0);
    const r = await work(reasonless);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /on the "basics" pack entry.*has no reason/);
    assert.equal((await world(overridden)).status, 0);
  } finally { cleanup(accepted); cleanup(reasonless); cleanup(overridden); }
});

test('settings validity: an unknown pack name in an entry object, and conflicting overrides, are blocking config errors', async () => {
  const unknown = makeRepo({ changed: { '.claudinite-settings.json': JSON.stringify({ packs: [{ id: 'no-such-pack' }] }) } });
  const conflicted = makeRepo({
    changed: {
      '.claudinite-settings.json': JSON.stringify({
        packs: [{ id: 'basics', rules: { 'reference-integrity': 'advisory' } }],
        rules: { 'reference-integrity': 'off' },
      }),
    },
  });
  try {
    const u = await world(unknown);
    assert.equal(u.status, 1);
    assert.match(u.stdout, /unknown pack "no-such-pack"/);
    const c = await world(conflicted);
    assert.equal(c.status, 1);
    assert.match(c.stdout, /rule "reference-integrity" is set to "off" by the top-level "rules" and "advisory" by the "basics" pack entry/);
  } finally { cleanup(unknown); cleanup(conflicted); }
});

test('severity override in config demotes a blocking rule to advisory', async () => {
  const root = makeRepo({
    changed: {
      'doc.md': '[gone](missing.md)\n',
      '.claudinite-settings.json': JSON.stringify({ packs: ['basics'], rules: { 'reference-integrity': 'advisory' } }),
    },
  });
  try {
    assert.equal((await work(root)).status, 0);
  } finally { cleanup(root); }
});

// SPAWNS: the world runner's process contract, and the largest thing it ever
// writes. #2062 was this catalog truncated mid-row because process.exit dropped
// a queued pipe write — visible only to a caller reading a real pipe, and
// invisible to an in-process call, which sees each console.log land whole.
test('--list emits the machine-readable rule catalog', () => {
  const root = makeRepo({ changed: {} });
  try {
    const r = runCli(root, '--list');
    // Carry stderr into the failure: a check missing from the catalog is a pack
    // that did not load, and the reason is only ever on that channel. Without it
    // the assertion below reports "this id is absent" and the run's own
    // explanation of why is thrown away.
    assert.equal(r.status, 0, `--list failed (signal ${r.signal}); stderr was:\n${r.stderr}`);
    for (const id of ['reference-integrity', 'markdown-link-labels',
                      'warning-suppression',
                      'squash-merge-history']) {
      assert.match(r.stdout, new RegExp(`^${id}\t`, 'm'),
        `${id} is absent from the catalog. stderr was:\n${r.stderr}`);
    }
  } finally { cleanup(root); }
});

// A pack that fails to load is absent from discoverPacks' `packs` rather than
// fatal — the reason goes to its `errors`. An entry point that reads one without
// the other cannot tell a pack that was never there from one that did not load,
// so it reports success over a registry it knows is incomplete (#2008).
const brokenPack = { '.claudinite/local/packs/broken/pack.mjs': 'throw new Error("boom");\n' };

test('--list refuses to print a catalog a pack failed to load into', async () => {
  const root = makeRepo({ changed: { ...brokenPack, '.claudinite-settings.json': JSON.stringify({ packs: ['local/broken'] }) } });
  try {
    const r = await world(root, '--list');
    assert.equal(r.status, 1, `--list must fail when a pack did not load. stdout was:\n${r.stdout}\nstderr was:\n${r.stderr}`);
    assert.match(r.stderr, /broken/);
    assert.match(r.stderr, /boom/);
    // stdout is the machine-readable channel a caller parses: the diagnostic
    // goes to stderr so a partial catalog is never mistaken for a complete one.
    assert.doesNotMatch(r.stdout, /boom/);
  } finally { cleanup(root); }
});

test('--init refuses to seed a declaration from a registry a pack failed to load into', async () => {
  const root = makeRepo({ changed: brokenPack });
  try {
    const r = await world(root, '--init');
    assert.equal(r.status, 1, `--init must fail when a pack did not load. stdout was:\n${r.stdout}\nstderr was:\n${r.stderr}`);
    assert.match(r.stderr, /boom/);
    // The declaration it would have written omits the pack that did not load,
    // and a member copies that file once — so it must not be written at all.
    assert.ok(!existsSync(join(root, '.claudinite-settings.json')), 'a partial registry must leave no declaration behind');
  } finally { cleanup(root); }
});

test("a pack's rules run only when it is declared", async () => {
  // A pack's rules run only where the project declared it. So the `gha/` checks stay
  // silent in a repo whose declaration does not name git-github — workflows present or
  // not — and declaring it turns them on. Whether to declare is the project's call.
  const wf = { '.github/workflows/x.yml': 'name: x\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    if: ${{ secrets.T }}\n    steps:\n      - run: echo hi\n' };
  const undeclared = makeRepo({
    changed: { ...wf, '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }) },
  });
  const declared = makeRepo({
    changed: { ...wf, '.claudinite-settings.json': JSON.stringify({ packs: ['basics', 'git-github'] }) },
  });
  try {
    const u = await world(undeclared);
    assert.equal(u.status, 0);              // gha rules don't run undeclared → clean
    assert.doesNotMatch(u.stdout, /gha\//);
    const d = await world(declared);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /gha\/secrets-in-job-if/);
  } finally { cleanup(undeclared); cleanup(declared); }
});

test('--init writes the pack declaration once and is idempotent', async () => {
  const root = makeRepo({ changed: {} });
  try {
    assert.equal((await world(root, '--init')).status, 0);
    assert.ok(existsSync(join(root, '.claudinite-settings.json')));
    const first = readFileSync(join(root, '.claudinite-settings.json'), 'utf8');
    // No pack is active by default, so --init materializes the seeded-by-default
    // declared packs: basics and core plus claudinite-growth and
    // claude-code-web-users-support (each opt-out by removal) — and the requires
    // closure: basics pulls core and git-github in, each materialized with its
    // provenance (`via`). core is seeded AND required, so it appears once, in the
    // seeded order, with no `via`.
    assert.deepEqual(JSON.parse(first).packs,
      ['basics', 'claudinite-lifecycle', { id: 'git-github', via: ['basics'] }, 'claude-code-web-users-support', 'claudinite-growth', 'claudinite-tasks']);
    // The declaration is the ONLY key seeded. The delivery preference used to be
    // materialized here too, but every project made the same selection, so the line
    // said nothing — it is an override now, written only by the project that wants
    // it (#1252). Empty rules/accept boilerplate is noise, not settings (#385).
    assert.deepEqual(Object.keys(JSON.parse(first)), ['packs']);
    assert.equal((await world(root, '--init')).status, 0);
    assert.equal(readFileSync(join(root, '.claudinite-settings.json'), 'utf8'), first);
  } finally { cleanup(root); }
});

test('a declared forbidReferences wall runs via the runner, under its own id', async () => {
  // product-wiki's isolation wall is declared data the ENGINE runs, so the pack
  // needs no other pack declared beside it — no cross-pack import anywhere.
  const root = makeRepo({ changed: {
    'product-wiki/Users/README.md': '# Users\n',
    'dev/notes.md': 'see product-wiki/Users/README.md\n',
    '.claudinite-settings.json': JSON.stringify({ packs: ['product-wiki'] }),
  } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /product-wiki-isolation\s+dev\/notes\.md/);
  } finally { cleanup(root); }
});

test('no pack runs undeclared — basics included', async () => {
  // Same blocking violation as above, but nothing declared: the baseline is
  // explicit opt-in, so the run stays silent and green.
  const bare = makeRepo({ changed: { 'doc.md': '[gone](missing.md)\n' } });
  const empty = makeRepo({ changed: {
    'doc.md': '[gone](missing.md)\n',
    '.claudinite-settings.json': JSON.stringify({ packs: [] }),
  } });
  try {
    for (const root of [bare, empty]) {
      const r = await work(root);
      assert.equal(r.status, 0);
      assert.doesNotMatch(r.stdout, /reference-integrity/);
    }
  } finally { cleanup(bare); cleanup(empty); }
});

test('a skill-owned check rides its owning pack\'s activation, and is listed', async () => {
  // routine-structure is bundled in claudinite-growth
  // (packs/claudinite-growth/skills/unattended-agents/): it runs when that
  // pack is declared and stays silent when no pack is.
  const artifact = { 'dev/routines/demo/routine.md': 'Run `bash dev/routines/demo/preconditions.sh`.\n' };
  const declared = makeRepo({ changed: { ...artifact, '.claudinite-settings.json': JSON.stringify({ packs: ['claudinite-growth'] }) } });
  const undeclared = makeRepo({ changed: { ...artifact } });
  try {
    const r = await world(declared);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /routine-structure/);
    assert.doesNotMatch((await world(undeclared)).stdout, /routine-structure/);
    assert.match((await world(declared, '--list')).stdout, /^routine-structure\t/m);
  } finally { cleanup(declared); cleanup(undeclared); }
});

// --- local packs (.claudinite/local/packs/) -------------------------------

// A pack.mjs whose one rule fires on a marker file, dependency-free (a real
// local pack's checks can't import the gitignored mount's helpers).
const LOCAL_PACK = `export default {
  id: 'proj', prose: 'RULES.md',
  ruleRoutingGuidance: {
    belongs: 'this demo project pack, whose one rule fires on a marker file',
    excludes: 'anything portable to another repo — that is a canon pack',
  },
  worldRules: [{
    id: 'no-todo-marker', severity: 'blocking',
    description: 'no TODO_MARKER files', doc: '.claudinite/local/packs/proj/RULES.md',
    why: 'demo local check',
    run(ctx) {
      return ctx.files.filter((f) => f.endsWith('TODO_MARKER')).map((f) => ({
        rule: 'no-todo-marker', severity: 'blocking', file: f, line: null,
        what: 'TODO_MARKER present', why: 'demo', fix: 'remove it',
        doc: '.claudinite/local/packs/proj/RULES.md',
      }));
    },
  }],
};`;

test('a declared local pack is valid and its check runs when active', async () => {
  const clean = makeRepo({ changed: {
    '.claudinite/local/packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-settings.json': JSON.stringify({ packs: ['proj'] }),
  } });
  const dirty = makeRepo({ changed: {
    '.claudinite/local/packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-settings.json': JSON.stringify({ packs: ['proj'] }),
    'src/TODO_MARKER': 'x\n',
  } });
  try {
    // declaring the local pack id is NOT an unknown-pack error
    const c = await world(clean);
    assert.doesNotMatch(c.stdout, /unknown pack/);
    assert.equal(c.status, 0);
    // and its check fires on a violating file
    const d = await world(dirty);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /no-todo-marker/);
    assert.match(d.stdout, /TODO_MARKER present/);
  } finally { cleanup(clean); cleanup(dirty); }
});

test('a local pack declared by its namespaced token local_packs/<name> validates and runs', async () => {
  const clean = makeRepo({ changed: {
    '.claudinite/local/packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-settings.json': JSON.stringify({ packs: ['local_packs/proj'] }),
  } });
  const dirty = makeRepo({ changed: {
    '.claudinite/local/packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-settings.json': JSON.stringify({ packs: ['local_packs/proj'] }),
    'src/TODO_MARKER': 'x\n',
  } });
  try {
    // the namespaced token resolves to the known bare id — no unknown-pack error
    const c = await world(clean);
    assert.doesNotMatch(c.stdout, /unknown pack/);
    assert.equal(c.status, 0, c.stdout);
    // and it activates the pack exactly like the bare form
    const d = await world(dirty);
    assert.equal(d.status, 1);
    assert.match(d.stdout, /no-todo-marker/);
  } finally { cleanup(clean); cleanup(dirty); }
});

test('an undeclared local pack does not run, but is not an unknown-pack error either', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/proj/pack.mjs': LOCAL_PACK,
    '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }),
    'src/TODO_MARKER': 'x\n',
  } });
  try {
    const r = await world(root);
    assert.equal(r.status, 0, r.stdout);
    assert.doesNotMatch(r.stdout, /no-todo-marker/); // present but undeclared → inert
  } finally { cleanup(root); }
});

test('a broken local pack.mjs surfaces a blocking config diagnostic, not a silent drop', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/broken/pack.mjs': 'export default { id: "broken" } this is not valid(',
    '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }),
  } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /config/);
    assert.match(r.stdout, /broken|failed to load/);
  } finally { cleanup(root); }
});

test('a local pack may not shadow a canon id — collision is a blocking config error', async () => {
  const root = makeRepo({ changed: {
    '.claudinite/local/packs/basics/pack.mjs': 'export default { id: "basics", rules: [] };',
    '.claudinite-settings.json': JSON.stringify({ packs: ['basics'] }),
  } });
  try {
    const r = await world(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /declared twice/);
  } finally { cleanup(root); }
});
