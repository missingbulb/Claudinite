import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { removeTree } from '../../../engine/remove-tree.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PREPARE = join(here, '..', 'session-prepare.mjs');
const START = join(here, '..', 'session-start.mjs');
const POURED = join('.claudinite', 'temp', 'packs', 'current_user');

// The pack's two steps, run exactly as the engine runs them: subprocesses, handed the
// pack's own entry config in CLAUDINITE_PACK_CONFIG and the session's identity in
// CLAUDE_CODE_USER_EMAIL. Most of what follows is one of the ways the pour can miss,
// because every one of them must be fail-soft — the pack contributes a nicety, and a
// nicety that can stop a session from starting is a defect, not a feature.
//
// Attendedness is one of those inputs, so every case states the one it means and none
// inherits the ambient value: the harness exports CLAUDE_CODE_SESSION_ATTENDED=0 in
// exactly the sessions the task queue runs in, so a case that let it through would
// assert about the session the suite happens to run in rather than the one it
// describes — green at a terminal and in CI, red for every unattended run. `attended:
// null` is the older harness that sets nothing at all.
const { CLAUDE_CODE_SESSION_ATTENDED: _ambientAttended, ...BASE_ENV } = process.env;

const run = (step, project, { email = 'me@example.com', config = {}, attended = '1', ...extra } = {}) => spawnSync('node', [step], {
  encoding: 'utf8',
  env: {
    ...BASE_ENV,
    CLAUDE_PROJECT_DIR: project,
    CLAUDE_CODE_USER_EMAIL: email,
    CLAUDINITE_PACK_CONFIG: JSON.stringify(config),
    // An unreachable store, so a case that reaches the clone path fails there rather
    // than going to the network from a test.
    CLAUDINITE_PREFS_CLONE_URL: join(tmpdir(), 'claudinite-no-such-store'),
    ...extra,
    ...(attended === null ? {} : { CLAUDE_CODE_SESSION_ATTENDED: attended }),
  },
});

const project = () => mkdtempSync(join(tmpdir(), 'claudinite-personal-'));
const pouredFile = (root, rel) => readFileSync(join(root, POURED, rel), 'utf8');
const receipt = (root) => JSON.parse(pouredFile(root, '.pour.json'));

// A store this tree holds, so the pour takes its local-first branch.
function storeHere(root, files, { path = 'preferences', email = 'me@example.com' } = {}) {
  for (const [rel, body] of Object.entries(files)) {
    const target = join(root, path, email, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

test('the whole pack is poured, not only its prose', () => {
  // The point of the shape: a person brings skills and checks, not just rules, and the
  // engine loads them because what landed is an ordinary pack directory.
  const root = project();
  try {
    storeHere(root, {
      'RULES.md': '# Mine\n\n- **Ending a turn** — a callout. (ending-turn)\n',
      'skills/pep-talk/SKILL.md': '---\nname: pep-talk\ndescription: Encourage.\n---\nBe kind.\n',
      'worldRules/mine.mjs': 'export default { id: "mine", run: () => [] };\n',
      'provenance/ending-turn.md': '# ending-turn\n',
    });
    assert.equal(run(PREPARE, root, { config: { repo: 'owner/store' } }).status, 0);

    const r = receipt(root);
    assert.equal(r.outcome, 'poured');
    assert.deepEqual(r.files.sort(), ['RULES.md', 'provenance/ending-turn.md', 'skills/pep-talk/SKILL.md', 'worldRules/mine.mjs']);
    assert.match(pouredFile(root, 'skills/pep-talk/SKILL.md'), /Be kind/);
    // A person with rules to state should not have to write a manifest to state them,
    // and the manifest written for them must claim neither the id nor a version.
    assert.match(pouredFile(root, 'pack.mjs'), /ruleRoutingGuidance/);
    assert.doesNotMatch(pouredFile(root, 'pack.mjs'), /\bid:|\bversion:/);
  } finally { removeTree(root); }
});

test('a pack that carries its own manifest keeps it', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'x\n', 'pack.mjs': 'export default { ruleRoutingGuidance: { belongs: "MINE" } };\n' });
    run(PREPARE, root, { config: { repo: 'owner/store' } });
    assert.match(pouredFile(root, 'pack.mjs'), /MINE/);
  } finally { removeTree(root); }
});

test('the store is read locally when this tree IS the store', () => {
  // The working copy wins: in the store repo itself, a clone would serve the default
  // branch and quietly hide the edit the owner is making right now.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'MY RULES\n' });
    assert.equal(run(PREPARE, root, { config: { repo: 'owner/store' } }).status, 0);
    assert.equal(receipt(root).where, 'working tree');
    assert.match(pouredFile(root, 'RULES.md'), /MY RULES/);
  } finally { removeTree(root); }
});

test('a declared path is honoured, not just the default', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'ELSEWHERE\n' }, { path: 'team/people' });
    run(PREPARE, root, { config: { repo: 'owner/store', path: 'team/people' } });
    assert.match(pouredFile(root, 'RULES.md'), /ELSEWHERE/);
  } finally { removeTree(root); }
});

test('nothing poured still leaves a pack the engine can load', () => {
  // The rules index imports the poured prose by a literal path in every session of a
  // repo that declares this pack, so the file has to be there even when nobody's pack is.
  const root = project();
  try {
    const r = run(PREPARE, root, { email: 'nobody@example.com', config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.equal(receipt(root).outcome, 'unreadable'); // the unreachable store above
    assert.match(pouredFile(root, 'RULES.md'), /No personal pack/);
  } finally { removeTree(root); }
});

test('every miss is a soft note from the start step, never a halt', () => {
  const root = project();
  try {
    run(PREPARE, root, { email: 'nobody@example.com', config: { repo: 'owner/store' } });
    const r = run(START, root, { email: 'nobody@example.com', config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /could not be read from owner\/store/);
    assert.match(r.stdout, /default interaction behavior/);
    assert.doesNotMatch(r.stdout, /STOP|AskUserQuestion/);              // fail-soft, no halt-gate
    assert.doesNotMatch(r.stdout, /hookSpecificOutput|additionalContext/); // plain text, no JSON envelope
  } finally { removeTree(root); }
});

test('no configured store is an ordinary state — a project may have none', () => {
  const root = project();
  try {
    for (const config of [{}, { repo: 'not-a-repo' }, { repo: 'o/n', path: '../escape' }]) {
      assert.equal(run(PREPARE, root, { config }).status, 0);
      assert.equal(receipt(root).outcome, 'no-store', JSON.stringify(config));
      assert.match(run(START, root, { config }).stdout, /declares no store for personal packs/);
    }
    // A malformed hand-off is the same case, not a crash.
    assert.equal(run(PREPARE, root, { CLAUDINITE_PACK_CONFIG: 'not json' }).status, 0);
    assert.equal(receipt(root).outcome, 'no-store');
  } finally { removeTree(root); }
});

test('no usable identity means there is nothing to look up', () => {
  const root = project();
  try {
    assert.equal(run(PREPARE, root, { email: '', config: { repo: 'owner/store' } }).status, 0);
    assert.equal(receipt(root).outcome, 'no-identity');
    assert.match(run(START, root).stdout, /CLAUDE_CODE_USER_EMAIL is not set/);

    // The identity becomes a directory name and a clone argument — an implausible one is
    // refused rather than traversed with.
    run(PREPARE, root, { email: '../../../etc/passwd', config: { repo: 'owner/store' } });
    assert.equal(receipt(root).outcome, 'unusable-identity');
    assert.match(run(START, root).stdout, /is not a usable directory name/);
  } finally { removeTree(root); }
});

test('an unattended session pours nothing, whoever it runs as', () => {
  // A routine fired under a person's account carries their identity but not their
  // presence; a pack written for a present person (a popup for every decision)
  // misdirects a run nobody is watching. Unset is an older harness, and pours.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'MY RULES\n' });
    assert.equal(run(PREPARE, root, { config: { repo: 'owner/store' }, attended: '0' }).status, 0);
    assert.equal(receipt(root).outcome, 'unattended');
    assert.match(pouredFile(root, 'RULES.md'), /No personal pack/);
    assert.match(run(START, root, { attended: '0' }).stdout, /the session is unattended/);

    for (const attended of ['1', '', null]) {
      run(PREPARE, root, { config: { repo: 'owner/store' }, attended });
      assert.match(pouredFile(root, 'RULES.md'), /MY RULES/, JSON.stringify(attended));
    }
  } finally { removeTree(root); }
});

test("an earlier session's pack is gone before this one's is poured", () => {
  // Content nobody in this session chose — another person's, or an older version of this
  // person's — must not survive into it. A pour is the second call the hand-off makes.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'FIRST\n', 'skills/gone/SKILL.md': 'x\n' });
    run(PREPARE, root, { config: { repo: 'owner/store' } });
    assert.ok(existsSync(join(root, POURED, 'skills', 'gone', 'SKILL.md')));

    removeTree(join(root, 'preferences', 'me@example.com', 'skills'));
    writeFileSync(join(root, 'preferences', 'me@example.com', 'RULES.md'), 'SECOND\n');
    run(PREPARE, root, { config: { repo: 'owner/store' } });
    assert.match(pouredFile(root, 'RULES.md'), /SECOND/);
    assert.equal(existsSync(join(root, POURED, 'skills', 'gone', 'SKILL.md')), false);
  } finally { removeTree(root); }
});

test('the poured pack is weighed onto the engine facet channel', () => {
  // The session's opening summary states how much loaded, and states it in TOKENS,
  // because a context window is what every part of the load is spent against. This is the
  // only thing in the session that can weigh it: the pack came from another repository.
  const root = project();
  try {
    // 76 words: 2 in the title, 2 in the heading, 3 of bullet-and-bold markup, and 69 of
    // prose — 101 tokens at the ratio, stated as 100 on the facet's rounding.
    storeHere(root, {
      'RULES.md': ['# Rules', '', '## Rules', '',
        `- **First** — ${Array.from({ length: 69 }, (_, i) => `w${i}`).join(' ')}`, ''].join('\n'),
    });
    run(PREPARE, root, { config: { repo: 'owner/store' } });
    const r = run(START, root, { config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^CLAUDINITE-FACET: 100 personal pack tokens$/m);
    // The rules themselves ride the memory channel, so this step must not spend the
    // context window on them a second time (#807).
    assert.doesNotMatch(r.stdout, /## Rules/);
  } finally { removeTree(root); }
});

test('a pack with no words at all states no facet', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': '  \n\n \t\n' });
    run(PREPARE, root, { config: { repo: 'owner/store' } });
    const r = run(START, root, { config: { repo: 'owner/store' } });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /CLAUDINITE-FACET/);
  } finally { removeTree(root); }
});

test('an engine with no prepare phase pours late and injects the rules itself', () => {
  // The pack and engine lanes deliver on separate cycles, so a member holds this pack
  // beside an older engine for a window. The person's skills go unmounted in it; their
  // rules do not go missing, because this branch puts them on the channel the step used
  // before the index carried them.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': '# Mine\n\nRULES FROM THE OLD PATH\n' });
    const r = run(START, root, { config: { repo: 'owner/store' } }); // no prepare run first
    assert.equal(r.status, 0);
    assert.match(r.stdout, /RULES FROM THE OLD PATH/);
    assert.equal(receipt(root).outcome, 'poured');

    // And once a pour has happened, the step goes back to saying nothing twice.
    assert.doesNotMatch(run(START, root, { config: { repo: 'owner/store' } }).stdout, /RULES FROM THE OLD PATH/);
  } finally { removeTree(root); }
});

test('a person still on the retired single file is poured, and told', () => {
  // One convergence window: the old address keeps working so nobody silently loses their
  // rules, and the note is what gets the directory made.
  const root = project();
  try {
    mkdirSync(join(root, 'preferences'), { recursive: true });
    writeFileSync(join(root, 'preferences', 'me@example.com.md'), '# Old\n\nSTILL A FILE\n');
    run(PREPARE, root, { config: { repo: 'owner/store' } });
    assert.equal(receipt(root).legacy, true);
    assert.match(pouredFile(root, 'RULES.md'), /STILL A FILE/);
    assert.match(run(START, root).stdout, /came from the retired me@example\.com\.md/);
  } finally { removeTree(root); }
});
