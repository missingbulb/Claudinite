import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../checks/test/helpers.mjs';
import { loadConfig } from '../../../../checks/lib/context.mjs';
import { loadPacks } from '../../../registry.mjs';
import { packQuestions, interviewState, renderPending } from './interview.mjs';

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
