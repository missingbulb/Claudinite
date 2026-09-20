import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDormant } from '../dormancy.mjs';
import { isDormant as queueIsDormant } from '../../claudinite-tasks/src/contract/dormancy.mjs';

// THE DRIFT GUARD for `dormancy.mjs`, this pack's own copy of the queue's dormancy
// predicate. The split is forced — packs share no code — so both copies are run over
// the same declarations, in both directions: a repo this pack reads as awake while its
// own scheduler has stopped is exactly the repo that then gets nagged for stopping.

const DECLARATIONS = [
  null, undefined, 42, 'dormant', {}, { dormant: true }, { dormant: false }, { dormant: 'true' },
  { raw: { dormant: true } }, { raw: { dormant: false }, dormant: true },
  { packs: [] }, { packs: ['basics'] }, { packs: [{ id: 'claudinite-tasks' }] },
  { packs: [{ id: 'claudinite-tasks', config: { dormant: true } }] },
  { packs: [{ id: 'claudinite-tasks', config: { dormant: false } }], dormant: true },
  { packs: [{ id: 'claudinite-tasks', config: { dormant: { since: 1 } } }] },
  { packs: [{ id: 'tasks', config: { dormant: true } }] },
  { packs: [{ id: 'claudinite-scheduler', config: { dormant: true } }] },
  { packConfig: { 'claudinite-tasks': { dormant: true } } },
  { packConfig: { 'claudinite-tasks': {} }, packs: [{ id: 'claudinite-tasks', config: { dormant: true } }] },
  { packConfig: { 'claudinite-tasks': null }, raw: { dormant: true } },
];

test('this pack reads the dormancy of every declaration exactly as the queue does', () => {
  const diffs = DECLARATIONS.filter((d) => isDormant(d) !== queueIsDormant(d)).map((d) => JSON.stringify(d));
  assert.deepEqual(diffs, []);
  assert.ok(DECLARATIONS.some((d) => queueIsDormant(d)) && DECLARATIONS.some((d) => !queueIsDormant(d)),
    'the corpus exercises both answers');
});
