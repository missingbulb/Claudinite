import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDormant } from '../src/read/dormancy.mjs';
import { isDormant as queueIsDormant } from '../../claudinite-tasks/src/contract/dormancy.mjs';

// THE DRIFT GUARD for `src/read/dormancy.mjs`, this pack's own copy of the queue's
// dormancy predicate. The split is forced — packs share no code — so both copies are
// run over the same declarations, in both directions: a repo this pack reads as awake
// while its own scheduler has stopped is exactly the repo that then gets nagged for
// stopping.

const DECLARATIONS = [
  null, undefined, 42, 'dormant', {}, { dormant: true }, { dormant: false }, { dormant: 'true' },
  { raw: { dormant: true } }, { raw: { dormant: false }, dormant: true },
  { packs: [] }, { packs: ['acme-pack'] }, { packs: [{ id: 'claudinite-tasks' }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'claudinite-tasks', config: { dormant: true } }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'claudinite-tasks', config: { dormant: false } }], dormant: true }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'claudinite-tasks', config: { dormant: { since: 1 } } }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packs: [{ id: 'tasks', config: { dormant: true } }] },
  { packs: [{ id: 'claudinite-scheduler', config: { dormant: true } }] },
  { packConfig: { 'claudinite-tasks': { dormant: true } } }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packConfig: { 'claudinite-tasks': {} }, packs: [{ id: 'claudinite-tasks', config: { dormant: true } }] }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
  { packConfig: { 'claudinite-tasks': null }, raw: { dormant: true } }, // @real-entity dormancy is this pack's own setting; the drift guard reads its real key
];

test('this pack reads the dormancy of every declaration exactly as the queue does', () => {
  const diffs = DECLARATIONS.filter((d) => isDormant(d) !== queueIsDormant(d)).map((d) => JSON.stringify(d));
  assert.deepEqual(diffs, []);
  assert.ok(DECLARATIONS.some((d) => queueIsDormant(d)) && DECLARATIONS.some((d) => !queueIsDormant(d)),
    'the corpus exercises both answers');
});
