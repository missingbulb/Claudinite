import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup, writeFiles } from '../helpers.mjs';

// This test lives at <repo>/engine-tests/hooks/; the real SessionEnd runner is at
// <repo>/engine/hooks/. Running the real file against a scratch repo exercises the
// true wiring — including pack discovery, which is what the runner is.
const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'hooks', 'session-end-command.mjs');

// The harness passes SessionEnd its payload on stdin.
function runHook(root, input = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: root, input: JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

// A local pack in the scratch repo, with a session-end step of the caller's choosing.
// Local packs are the cheapest real pack the registry will load, so the runner is
// tested through actual discovery rather than a stub.
function withLocalPack(step, { declared = ['local/probe'] } = {}) {
  const root = makeRepo({
    changed: {
      '.claudinite-checks.json': JSON.stringify({ packs: declared }),
      '.claudinite/local/packs/probe/pack.mjs': 'export default { id: "probe", detect: null, marker: null, prose: null, rules: [] };\n',
      '.claudinite/local/packs/probe/session-end.mjs': step,
    },
  });
  return root;
}

test('the SessionEnd runner invokes an active pack\'s step and hands it the session facts', () => {
  const root = withLocalPack(`
    import { writeFileSync } from 'node:fs';
    writeFileSync('ran.json', JSON.stringify({
      session: process.env.CLAUDINITE_SESSION_ID ?? null,
      transcript: process.env.CLAUDINITE_TRANSCRIPT ?? null,
      cwd: process.cwd(),
    }));
    console.log('probe step ran');
  `);
  try {
    const r = runHook(root, { session_id: 'sess-42', transcript_path: '/tmp/sess-42.jsonl', reason: 'clear' });
    assert.equal(r.status, 0, r.stderr);
    const ran = JSON.parse(readFileSync(join(root, 'ran.json'), 'utf8'));
    assert.equal(ran.session, 'sess-42');
    assert.equal(ran.transcript, '/tmp/sess-42.jsonl');
    assert.equal(ran.cwd, root, 'the step runs at the project root, not in the pack dir');
    // The durable hook log is how an intermittent "it didn't run" becomes inspectable.
    const hooklog = readFileSync(join(root, '.claudinite-hooks.log'), 'utf8');
    assert.match(hooklog, /SessionEnd: start probe/);
    assert.match(hooklog, /SessionEnd: done exit=0 probe/);
  } finally { cleanup(root); }
});

test('a step that fails cannot fail the session — the runner swallows it and says so', () => {
  const root = withLocalPack('console.error("no origin remote"); process.exit(1);\n');
  try {
    const r = runHook(root, { session_id: 'sess-1' });
    assert.equal(r.status, 0, 'the hook must never block a session from ending');
    const hooklog = readFileSync(join(root, '.claudinite-hooks.log'), 'utf8');
    assert.match(hooklog, /step failed \(exit 1\)/);
    assert.match(hooklog, /no origin remote/, 'the failure reason is recorded, not swallowed silently');
  } finally { cleanup(root); }
});

test('a pack that is not declared contributes nothing — activation gates the step', () => {
  const root = withLocalPack(`
    import { writeFileSync } from 'node:fs';
    writeFileSync('ran.json', '{}');
  `, { declared: [] });
  try {
    const r = runHook(root, { session_id: 'sess-1' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(root, 'ran.json')), 'an undeclared pack\'s step must not run');
    assert.ok(!existsSync(join(root, '.claudinite-hooks.log')), 'and nothing is logged — there was nothing to do');
  } finally { cleanup(root); }
});

test('a repo with no declaration at all exits clean', () => {
  const root = makeRepo({ changed: { 'a.txt': 'hi\n' } });
  try {
    const r = runHook(root, {});
    assert.equal(r.status, 0, r.stderr);
  } finally { cleanup(root); }
});

test('the grow_with_claudinite pack ships the capture step the runner picks up', () => {
  // The one coupling worth pinning across the engine/pack boundary: the runner looks
  // for `session-end.mjs` in a pack dir, and this pack's whole SessionEnd capture
  // depends on being found by exactly that name. A rename on either side is silent.
  const packStep = join(dirname(fileURLToPath(import.meta.url)), '..', '..',
    'packs', 'grow_with_claudinite', 'session-end.mjs');
  assert.ok(existsSync(packStep), 'grow_with_claudinite/session-end.mjs is what the runner discovers');
  const source = readFileSync(packStep, 'utf8');
  assert.match(source, /CLAUDINITE_SESSION_ISSUE/, 'and it reads the issue the runner passes on');
  assert.match(source, /'0'/, 'defaulting to issue 0 — no associated issue — when none was named');
});

test('the runner passes on the issue an explicit invocation named, and nothing when it did not', () => {
  // The unattended path: a scheduler executor session ends by having its container
  // reclaimed, so no SessionEnd hook ever fires for it. It runs this runner itself and
  // names its dispatch issue — which is what files that session's log under the task
  // it ran instead of in the issueless pile.
  const root = withLocalPack(`
    import { writeFileSync } from 'node:fs';
    writeFileSync('ran.json', JSON.stringify({ issue: process.env.CLAUDINITE_SESSION_ISSUE ?? null }));
  `);
  try {
    const named = spawnSync(process.execPath, [HOOK], {
      cwd: root, input: '', encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDINITE_SESSION_ISSUE: '772' },
    });
    assert.equal(named.status, 0, named.stderr);
    assert.equal(JSON.parse(readFileSync(join(root, 'ran.json'), 'utf8')).issue, '772');

    // A hook firing knows nothing about what the session was for, and must not invent it.
    const hook = runHook(root, { session_id: 'sess-1', transcript_path: '/tmp/s.jsonl' });
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(JSON.parse(readFileSync(join(root, 'ran.json'), 'utf8')).issue, null);
  } finally { cleanup(root); }
});
