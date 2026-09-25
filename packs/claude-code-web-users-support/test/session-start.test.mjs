import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { removeTree } from '../../../engine/remove-tree.mjs';
import { git } from '../../../engine-tests/helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PREPARE = join(here, '..', 'session-prepare.mjs');
const START = join(here, '..', 'session-start.mjs');
const COPIED = join('.claudinite', 'temp', 'packs', 'current_user');

// The pack's two steps, run exactly as the engine runs them: subprocesses, handed the pack's
// own entry config in CLAUDINITE_PACK_CONFIG and the session's GitHub login. Most of what follows is one of the ways the copy can miss, because
// every one of them must be fail-soft: the pack contributes a nicety, and a nicety that can
// stop a session from starting is a defect, not a feature.
//
// Attendedness is one of those inputs, so every case states the one it means and none inherits
// the ambient value: the harness exports CLAUDE_CODE_SESSION_ATTENDED=0 in exactly the sessions
// the task queue runs in, so a case that let it through would assert about the session the
// suite happens to run in rather than the one it describes, green at a terminal and in CI and
// red for every unattended run. `attended: null` is the older harness that sets nothing at all.
// The GitHub login is an input the same way: served from a `data:` URL so no case reaches the
// network, and `login: null` is a read that fails, against a port nothing listens on.
const { CLAUDE_CODE_SESSION_ATTENDED: _ambientAttended, GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...BASE_ENV } = process.env;
const userUrl = (login) => (login === null
  ? 'http://127.0.0.1:9/user'
  : `data:application/json,${encodeURIComponent(JSON.stringify({ login }))}`);

const run = (step, project, { login = 'acme-user', config = {}, attended = '1', ...extra } = {}) => spawnSync('node', [step], {
  encoding: 'utf8',
  env: {
    ...BASE_ENV,
    CLAUDE_PROJECT_DIR: project,
    GH_TOKEN: 'acme-token',
    CLAUDINITE_GITHUB_USER_URL: userUrl(login),
    CLAUDINITE_PACK_CONFIG: JSON.stringify(config),
    // An unreachable store, so a case that reaches the clone path fails there rather than
    // going to the network from a test.
    CLAUDINITE_USER_PACKS_CLONE_URL: join(tmpdir(), 'claudinite-no-such-store'),
    ...extra,
    ...(attended === null ? {} : { CLAUDE_CODE_SESSION_ATTENDED: attended }),
  },
});

const project = () => mkdtempSync(join(tmpdir(), 'claudinite-personal-'));
const copied = (root, rel) => readFileSync(join(root, COPIED, rel), 'utf8');
const STORE = { repo: 'owner/store' };

// A store this tree holds, so the copy takes its local-first branch.
function storeHere(root, files, { path = 'preferences', login = 'acme-user' } = {}) {
  for (const [rel, body] of Object.entries(files)) {
    const target = join(root, path, login, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

test('the whole pack is copied, not only its prose', () => {
  // The point of the shape: a person brings skills and checks, not just rules, and the engine
  // loads them because what landed is an ordinary pack directory.
  const root = project();
  try {
    storeHere(root, {
      'RULES.md': '# Mine\n\n- **Ending a turn** - a callout. (ending-turn)\n',
      'skills/pep-talk/SKILL.md': '---\nname: pep-talk\ndescription: Encourage.\n---\nBe kind.\n',
      'worldRules/mine.mjs': 'export default { id: "mine", run: () => [] };\n',
      'provenance/ending-turn.md': '# ending-turn\n',
    });
    assert.equal(run(PREPARE, root, { config: STORE }).status, 0);

    assert.match(copied(root, 'RULES.md'), /Ending a turn/);
    assert.match(copied(root, 'skills/pep-talk/SKILL.md'), /Be kind/);
    assert.match(copied(root, 'worldRules/mine.mjs'), /id: "mine"/);
    assert.match(copied(root, 'provenance/ending-turn.md'), /ending-turn/);
    // A person with rules to state should not have to write a manifest to state them, and the
    // manifest written for them must claim neither the id nor a version.
    assert.match(copied(root, 'pack.mjs'), /ruleRoutingGuidance/);
    assert.doesNotMatch(copied(root, 'pack.mjs'), /\bid:|\bversion:/);
  } finally { removeTree(root); }
});

test('a pack that carries its own manifest keeps it', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'x\n', 'pack.mjs': 'export default { ruleRoutingGuidance: { belongs: "MINE" } };\n' });
    run(PREPARE, root, { config: STORE });
    assert.match(copied(root, 'pack.mjs'), /MINE/);
  } finally { removeTree(root); }
});

test('the pack is found by the lower-cased login, and the note names both', () => {
  // GitHub compares logins case-insensitively and a directory name does not, so the store keeps
  // the lower-case form and the reader folds what the API returns into it.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'MINE\n' });
    run(PREPARE, root, { login: 'Acme-User', config: STORE });
    assert.match(copied(root, 'RULES.md'), /MINE/);
    assert.match(run(START, root, { login: 'Acme-User', config: STORE }).stdout,
      /copied preferences\/acme-user\/ from owner\/store for GitHub user Acme-User/);
  } finally { removeTree(root); }
});

test('the store is read locally when this tree IS the store', () => {
  // The working copy wins: in the store repo itself, a clone would serve the default branch and
  // quietly hide the edit the owner is making right now.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'MY RULES\n' });
    assert.equal(run(PREPARE, root, { config: STORE }).status, 0);
    assert.match(copied(root, 'RULES.md'), /MY RULES/);
  } finally { removeTree(root); }
});

test('a declared path is honoured, not just the default', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'ELSEWHERE\n' }, { path: 'team/people' });
    run(PREPARE, root, { config: { ...STORE, path: 'team/people' } });
    assert.match(copied(root, 'RULES.md'), /ELSEWHERE/);
  } finally { removeTree(root); }
});

test('nothing copied still leaves a pack the engine can load', () => {
  // The rules index imports the copied prose by a literal path in every session of a repo that
  // declares this pack, so the file has to be there even when nobody's pack is.
  const root = project();
  try {
    const r = run(PREPARE, root, { login: 'nobody', config: STORE });
    assert.equal(r.status, 0);
    assert.match(copied(root, 'RULES.md'), /No personal pack/);
  } finally { removeTree(root); }
});

test('what a session copies in never shows up as a change to commit', () => {
  // The member's own .gitignore may say nothing about the session root, so the root has to
  // ignore itself, on the copy path and on the placeholder path alike.
  for (const login of ['acme-user', 'nobody']) {
    const root = project();
    try {
      git(root, 'init', '-q');
      storeHere(root, { 'RULES.md': 'x\n' });
      assert.equal(run(PREPARE, root, { login, config: STORE }).status, 0);
      assert.ok(existsSync(join(root, COPIED, 'RULES.md')));
      assert.doesNotMatch(git(root, 'status', '--porcelain', '--untracked-files=all'), /\.claudinite/, login);
    } finally { removeTree(root); }
  }
});

test('every miss is a soft note from the start step, never a halt', () => {
  const root = project();
  try {
    run(PREPARE, root, { login: 'nobody', config: STORE });
    const r = run(START, root, { login: 'nobody', config: STORE });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /owner\/store holds no pack at preferences\/nobody\/ for GitHub user nobody/);
    assert.match(r.stdout, /default interaction behavior/);
    assert.doesNotMatch(r.stdout, /STOP|AskUserQuestion/);              // fail-soft, no halt-gate
    assert.doesNotMatch(r.stdout, /hookSpecificOutput|additionalContext/); // plain text, no JSON envelope
  } finally { removeTree(root); }
});

test('the start step names the reason without a status file to read it from', () => {
  // The reasons are a pure function of the config and the environment, so the step that says
  // them needs nothing the step that acted on them left behind.
  const root = project();
  try {
    for (const [opts, expected] of [
      [{ config: {} }, /declares no store/],
      [{ config: STORE, attended: '0' }, /unattended/],
      [{ config: STORE, login: null }, /no GitHub login was read/],
      [{ config: STORE, login: '../../../etc/passwd' }, /not a usable GitHub login/],
    ]) {
      run(PREPARE, root, opts);
      assert.match(copied(root, 'RULES.md'), /No personal pack/, JSON.stringify(opts));
      assert.match(run(START, root, opts).stdout, expected);
    }
    // A malformed hand-off is the same case, not a crash.
    assert.equal(run(PREPARE, root, { CLAUDINITE_PACK_CONFIG: 'not json' }).status, 0);
    assert.match(run(START, root, { CLAUDINITE_PACK_CONFIG: 'not json' }).stdout, /declares no store/);
  } finally { removeTree(root); }
});

test('an unattended session copies nothing, whoever it runs as', () => {
  // A routine fired under a person's account carries their identity but not their presence, and
  // a pack written for a present person (a popup for every decision) misdirects a run nobody is
  // watching. Unset is an older harness, and copies.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'MY RULES\n' });
    assert.equal(run(PREPARE, root, { config: STORE, attended: '0' }).status, 0);
    assert.match(copied(root, 'RULES.md'), /No personal pack/);

    for (const attended of ['1', '', null]) {
      run(PREPARE, root, { config: STORE, attended });
      assert.match(copied(root, 'RULES.md'), /MY RULES/, JSON.stringify(attended));
    }
  } finally { removeTree(root); }
});

test("an earlier session's pack is gone before this one's is copied", () => {
  // Content nobody in this session chose, another person's or an older version of this person's,
  // must not survive into it. A copy is the second call the hand-off makes.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'FIRST\n', 'skills/gone/SKILL.md': 'x\n' });
    run(PREPARE, root, { config: STORE });
    assert.ok(existsSync(join(root, COPIED, 'skills', 'gone', 'SKILL.md')));

    removeTree(join(root, 'preferences', 'acme-user', 'skills'));
    writeFileSync(join(root, 'preferences', 'acme-user', 'RULES.md'), 'SECOND\n');
    run(PREPARE, root, { config: STORE });
    assert.match(copied(root, 'RULES.md'), /SECOND/);
    assert.equal(existsSync(join(root, COPIED, 'skills', 'gone', 'SKILL.md')), false);
  } finally { removeTree(root); }
});

test('the copied pack is not weighed here — the summary counts it with every other pack', () => {
  // It lands on disk before the summary step runs, and the summary reads it off the same
  // registry as the rest, so a figure emitted here would be the one set of rules stated twice
  // under two names. What this step still owes a reader is why a person HAS no pack, which no
  // count can say.
  const root = project();
  try {
    storeHere(root, {
      'RULES.md': ['# Rules', '', '## Rules', '',
        `- **First** - ${Array.from({ length: 69 }, (_, i) => `w${i}`).join(' ')}`, ''].join('\n'),
    });
    run(PREPARE, root, { config: STORE });
    const r = run(START, root, { config: STORE });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /personal pack tokens/);
    // The rules themselves ride the memory channel, so this step must not spend the context
    // window on them a second time (#807).
    assert.doesNotMatch(r.stdout, /## Rules/);
  } finally { removeTree(root); }
});

test('an engine with no prepare phase says so, and reports nothing about this person', () => {
  // The pack and engine lanes deliver on separate cadences, so a member holds this pack beside
  // an older engine for a window. In it nobody gets a personal pack, which is a fact about the
  // repo rather than about the person, and saying which is all this step can do.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'MY RULES\n' });
    const r = run(START, root, { config: STORE }); // no prepare run first
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no session-prepare phase/);
    assert.doesNotMatch(r.stdout, /MY RULES/);
    assert.equal(existsSync(join(root, COPIED, 'RULES.md')), false, 'the reporting step writes nothing');
  } finally { removeTree(root); }
});
