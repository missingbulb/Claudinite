import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { loadConfig } from '../../../../engine/checks/helpers/repo-context.mjs';
import { loadPacks } from '../../../../engine/pack_loader/pack-registry.mjs';
import { packQuestions, interviewState, renderPending } from '../../../../packs/grow_with_claudinite/skills/adopt-claudinite/interview.mjs';

const CLI = fileURLToPath(new URL('../../../../packs/grow_with_claudinite/skills/adopt-claudinite/interview.mjs', import.meta.url));

const pack = (over = {}) => ({
  id: 'p',
  questions: [{ id: 'q1', prompt: 'P1?' }, { id: 'q2', prompt: 'P2?', distill: 'D2' }],
  ...over,
});
const cfg = (entries) => ({ packs: entries.map((e) => e.id), packEntries: entries });

test('adoption gap: an active pack with no answers has every question pending', () => {
  const { pending, stale, errors } = interviewState([pack()], cfg([{ id: 'p' }]));
  assert.deepEqual(pending, [{ packId: 'p', questions: pack().questions }]);
  assert.deepEqual(stale, []);
  assert.deepEqual(errors, []);
});

test('a new question surfaces alone; an answered one stays answered (empty answer included)', () => {
  // q1 was answered before q2 existed — only the new question is pending.
  const { pending } = interviewState([pack()], cfg([{ id: 'p', answers: { q1: 'done' } }]));
  assert.deepEqual(pending, [{ packId: 'p', questions: [{ id: 'q2', prompt: 'P2?', distill: 'D2' }] }]);
  // Presence is the signal: "n/a — none wanted" (even '') is an answer, distinct from never-asked.
  const all = interviewState([pack()], cfg([{ id: 'p', answers: { q1: '', q2: 'x' } }]));
  assert.deepEqual(all.pending, []);
});

test('a via-materialized dependency asks nothing until the project engages with it', () => {
  // Pulled in by another pack's requires (the resolver stamps `via`): not a
  // chosen adoption, so its questions stay quiet...
  const materialized = interviewState([pack()], cfg([{ id: 'p', via: ['other'] }]));
  assert.deepEqual(materialized.pending, []);
  // ...until the project engages — its own config or answers on the entry
  // makes the interview apply again (unanswered questions resurface).
  const engaged = interviewState([pack()], cfg([{ id: 'p', via: ['other'], config: { k: 1 } }]));
  assert.equal(engaged.pending.length, 1);
  const answering = interviewState([pack()], cfg([{ id: 'p', via: ['other'], answers: { q1: 'done' } }]));
  assert.deepEqual(answering.pending, [{ packId: 'p', questions: [{ id: 'q2', prompt: 'P2?', distill: 'D2' }] }]);
});

test('no questions or inactive pack → complete no-op', () => {
  const none = interviewState([pack({ questions: undefined })], cfg([{ id: 'p' }]));
  assert.deepEqual(none, { pending: [], stale: [], errors: [] });
  const inactive = interviewState([pack()], cfg([]));
  assert.deepEqual(inactive, { pending: [], stale: [], errors: [] });
});

test('a stored answer whose question is gone is stale — including answers on a question-less pack', () => {
  const { stale } = interviewState([pack()], cfg([{ id: 'p', answers: { q1: 'x', gone: 'y' } }]));
  assert.deepEqual(stale, [{ packId: 'p', answerId: 'gone' }]);
  const all = interviewState([pack({ questions: undefined })], cfg([{ id: 'p', answers: { q1: 'x' } }]));
  assert.deepEqual(all.stale, [{ packId: 'p', answerId: 'q1' }]);
});

test('packQuestions: malformed declarations are reported, valid questions survive them', () => {
  const nonArray = packQuestions(pack({ questions: 'nope' }));
  assert.deepEqual(nonArray.questions, []);
  assert.match(nonArray.errors[0].what, /non-array "questions"/);

  const mixed = packQuestions(pack({
    questions: [{ id: 'ok', prompt: 'fine?' }, { id: 'noprompt' }, { id: 'ok', prompt: 'dup' }],
  }));
  assert.deepEqual(mixed.questions, [{ id: 'ok', prompt: 'fine?' }]);
  assert.equal(mixed.errors.length, 2);
  assert.match(mixed.errors[0].what, /malformed question/);
  assert.match(mixed.errors[1].what, /question id "ok" twice/);
});

test('a malformed declaration suppresses stale detection for that pack (the error already tells)', () => {
  const { stale, errors } = interviewState(
    [pack({ questions: 'nope' })], cfg([{ id: 'p', answers: { q1: 'x' } }]));
  assert.equal(errors.length, 1);
  assert.deepEqual(stale, []); // every answer would look stale against an unreliable declared set
});

test('renderPending: prompts + distill notes, and the unattended self-defuse wording', () => {
  const out = renderPending([{ packId: 'p', questions: pack().questions }]);
  assert.match(out, /- p \/ q1: P1\?/);
  assert.match(out, /- p \/ q2: P2\? \[distill: D2\]/);
  assert.match(out, /unattended session.*ignore it entirely/);
  assert.match(out, /never a gate/);
});

test('integration: declaring barriers pends its goals question until the entry answers it', async () => {
  const packs = await loadPacks();
  const unanswered = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['barriers'] }) } });
  const answered = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({
    packs: [{ id: 'barriers', answers: { goals: 'keep core generic' } }],
  }) } });
  try {
    const p = interviewState(packs, loadConfig(unanswered)).pending;
    assert.equal(p.length, 1);
    assert.equal(p[0].packId, 'barriers');
    assert.deepEqual(p[0].questions.map((q) => q.id), ['goals']);
    assert.deepEqual(interviewState(packs, loadConfig(answered)).pending, []);
  } finally { cleanup(unanswered); cleanup(answered); }
});

// The CLI, run as a CHILD PROCESS — the only context where this module's import
// cycle closes, and so the only shape that can catch it. Every test above
// imports the pure helpers directly, which is exactly why the cycle shipped: it
// deadlocked `interview.mjs check` in every repo (Node exits 13, "unsettled
// top-level await") while the pure-function coverage stayed green. Asserting the
// note reaches stdout, not merely that the exit code is 0, is deliberate — a
// process that exits clean having printed nothing is the bug's own signature.
test('CLI: `check` prints the pending note and exits clean (its import cycle must not deadlock)', () => {
  const repo = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({ packs: ['barriers'] }) } });
  try {
    const r = spawnSync(process.execPath, [CLI, 'check'], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    });
    assert.equal(r.status, 0, `exited ${r.status}\nstderr: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /unsettled top-level await/, 'the CLI deadlocked on its own import cycle');
    assert.match(r.stdout, /Pack adoption interview pending/);
    assert.match(r.stdout, /- barriers \/ goals:/);
  } finally { cleanup(repo); }
});

test('CLI: a repo with nothing pending prints nothing and exits clean', () => {
  const repo = makeRepo({ base: { '.claudinite-checks.json': JSON.stringify({
    packs: [{ id: 'barriers', answers: { goals: 'n/a — none wanted' } }],
  }) } });
  try {
    const r = spawnSync(process.execPath, [CLI, 'check'], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    });
    assert.equal(r.status, 0, `exited ${r.status}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
  } finally { cleanup(repo); }
});

test('CLI: an unknown subcommand still reports usage and exits 2', () => {
  const r = spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: interview\.mjs check/);
});
