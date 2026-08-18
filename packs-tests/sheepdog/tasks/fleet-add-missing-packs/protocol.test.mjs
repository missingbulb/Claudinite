import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as enforcerSide from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/protocol.mjs';
import * as memberSide from '../../../../packs/core/tasks/adopt-requested-packs/protocol.mjs';
import { MEMBER_TASK } from '../../../../packs/sheepdog/tasks/fleet-add-missing-packs/worker.mjs';
import memberDecl from '../../../../packs/core/tasks/adopt-requested-packs/task.mjs';

// The add-packs protocol is a contract between two packs that may not import each
// other (pack-independence), so each carries its own copy and THIS test is the one
// place the copies are held together. It lives on the enforcer side because the
// enforcer is the writer — the side whose drift would strand work in every member.

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const at = (p) => readFileSync(join(root, p), 'utf8');

test('the two protocol copies are byte-identical', () => {
  // Not just behaviourally equal — identical, so a change to either is a one-file
  // diff away from being a change to both, and review sees the protocol move once.
  assert.equal(
    at('packs/sheepdog/tasks/fleet-add-missing-packs/protocol.mjs'),
    at('packs/core/tasks/adopt-requested-packs/protocol.mjs'),
  );
});

test('label and titles agree across the boundary', () => {
  assert.equal(enforcerSide.LABEL, memberSide.LABEL);
  assert.equal(enforcerSide.REQUESTED_TITLE, memberSide.REQUESTED_TITLE);
  assert.equal(enforcerSide.SUSPECTED_TITLE, memberSide.SUSPECTED_TITLE);
});

test('the task id the enforcer fires is the member task\'s directory id', () => {
  // The other half of the coupling the worker's MEMBER_TASK constant names: the
  // member's tick resolves the `wake` input against task ids, so a rename of the
  // member task silently turns every fan-out into a no-op without this pin.
  assert.equal(MEMBER_TASK, memberDecl.id);
});

test('entriesIn round-trips a fenced JSON block and refuses everything else', () => {
  const entries = [{ id: 'p', config: { a: '1' } }];
  const body = `prose\n\`\`\`json\n${JSON.stringify(entries, null, 2)}\n\`\`\`\nmore prose`;
  assert.deepEqual(enforcerSide.entriesIn(body), entries);
  // null — never [] — for anything unreadable: "could not tell" must be
  // distinguishable from "asked for nothing".
  assert.equal(enforcerSide.entriesIn('no block'), null);
  assert.equal(enforcerSide.entriesIn('```json\n{broken\n```'), null);
  assert.equal(enforcerSide.entriesIn('```json\n{"id":"not-an-array"}\n```'), null);
  assert.equal(enforcerSide.entriesIn(null), null);
});
