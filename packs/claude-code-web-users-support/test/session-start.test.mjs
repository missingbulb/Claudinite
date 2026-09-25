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
// own entry config in CLAUDINITE_PACK_CONFIG and the session's identity: the GitHub login its
// token reads back, and CLAUDE_CODE_USER_EMAIL for the legacy directory. Most of what follows
// is one of the ways the copy can miss, because every one of them must be fail-soft: the pack
// contributes a nicety, and a nicety that can stop a session from starting is a defect, not a
// feature.
//
// Attendedness and the tokens are among those inputs, so every case states the ones it means
// and none inherits the ambient value: the harness exports CLAUDE_CODE_SESSION_ATTENDED=0 in
// exactly the sessions the task queue runs in, and a real GH_TOKEN in every web session, so a
// case that let them through would assert about the session the suite happens to run in rather
// than the one it describes. `attended: null` is the older harness that sets nothing at all.
// The login is served from a `data:` URL, so no case goes to the network; `login: null` is a
// lookup that fails, against a port nothing listens on.
const { CLAUDE_CODE_SESSION_ATTENDED: _ambientAttended, GH_TOKEN: _gh, GITHUB_TOKEN: _github, ...BASE_ENV } = process.env;
const userUrl = (login) => (login === null
  ? 'http://127.0.0.1:9/user'
  : `data:application/json,${encodeURIComponent(JSON.stringify({ login }))}`);

const run = (step, project, { email = 'me@example.com', login = 'acme-user', config = {}, attended = '1', ...extra } = {}) => spawnSync('node', [step], {
  encoding: 'utf8',
  env: {
    ...BASE_ENV,
    CLAUDE_PROJECT_DIR: project,
    CLAUDE_CODE_USER_EMAIL: email,
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
function storeHere(root, files, { path = 'preferences', dir = 'acme-user' } = {}) {
  for (const [rel, body] of Object.entries(files)) {
    const target = join(root, path, dir, rel);
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

test('the pack is addressed by the GitHub login, lower-cased, and the note says which', () => {
  // GitHub compares logins case-insensitively and a directory name does not, so the store keeps
  // the lower-case form and the reader folds what the API returns into it.
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'BY LOGIN\n' });
    storeHere(root, { 'RULES.md': 'BY EMAIL\n' }, { dir: 'me@example.com' });
    run(PREPARE, root, { login: 'Acme-User', config: STORE });
    assert.match(copied(root, 'RULES.md'), /BY LOGIN/, 'the login wins over the legacy email directory');
    const r = run(START, root, { login: 'Acme-User', config: STORE });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /GitHub user Acme-User/);
    assert.match(r.stdout, /preferences\/acme-user\//);
    assert.doesNotMatch(r.stdout, /fallback/);
  } finally { removeTree(root); }
});

test('with no login directory yet, the legacy email directory is read, and the note says to move it', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'BY EMAIL\n' }, { dir: 'me@example.com' });
    run(PREPARE, root, { config: STORE });
    assert.match(copied(root, 'RULES.md'), /BY EMAIL/);
    const out = run(START, root, { config: STORE }).stdout;
    assert.match(out, /preferences\/me@example\.com\//);
    assert.match(out, /fallback/);
    assert.match(out, /preferences\/acme-user\//, 'names the directory to move it to');
  } finally { removeTree(root); }
});

test('a login that cannot be read falls back to the email, and the note says why', () => {
  const root = project();
  try {
    storeHere(root, { 'RULES.md': 'BY EMAIL\n' }, { dir: 'me@example.com' });
    for (const opts of [{ login: null }, { login: '../escape' }, { GH_TOKEN: '' }]) {
      const r = run(PREPARE, root, { ...opts, config: STORE });
      assert.equal(r.status, 0);
      assert.match(copied(root, 'RULES.md'), /BY EMAIL/, JSON.stringify(opts));
      const out = run(START, root, { ...opts, config: STORE }).stdout;
      assert.match(out, /no GitHub login/, JSON.stringify(opts));
      assert.match(out, /me@example\.com/);
    }
  } finally { removeTree(root); }
});

test('no usable identity of either kind is a soft note naming both', () => {
  const root = project();
  try {
    run(PREPARE, root, { login: null, email: '', config: STORE });
    assert.match(copied(root, 'RULES.md'), /No personal pack/);
    const out = run(START, root, { login: null, email: '../../../etc/passwd', config: STORE }).stdout;
    assert.match(out, /no GitHub login/);
    assert.match(out, /CLAUDE_CODE_USER_EMAIL/);
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
    assert.match(r.stdout, /owner\/store holds no pack at preferences\/nobody\/ or preferences\/me@example\.com\//);
    assert.match(r.stdout, /default interaction behavior/);
    assert.doesNotMatch(r.stdout, /STOP|AskUserQuestion/);              // fail-soft, no halt-gate
    assert.doesNotMatch(r.stdout, /hookSpecificOutput|additionalContext/); // plain text, no JSON envelope
  } finally { removeTree(root); }
});

test('a session declined whoever it is says why, from the config and the environment alone', () => {
  const root = project();
  try {
    for (const [opts, expected] of [
      [{ config: {} }, /declares no store/],
      [{ config: STORE, attended: '0' }, /unattended/],
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
