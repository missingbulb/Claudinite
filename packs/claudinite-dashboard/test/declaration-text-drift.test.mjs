import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskDeclaration, applyTaskDefaults } from '../src/derive/declaration-text.mjs';
import { parseTaskDeclaration as queueParse } from '../../claudinite-tasks/src/contract/task-declaration-text.mjs';
import { applyTaskDefaults as queueDefaults } from '../../claudinite-tasks/src/contract/task-defaults.mjs';

// THE DRIFT GUARD for `src/derive/declaration-text.mjs`, the dashboard's own copy of
// the queue's text reader and defaults. The split is forced — packs share no code — so
// both copies are run over the same texts, in both directions.

const TEXTS = [
  '{}', '{"$schema":"x","id":"a"}', '{"agent_model":"opus"}', '{"expected_outcome":"no_code_changes"}',
  '{"expected_outcome":"pr","automerge":"anything"}', '{"expected_outcome":"pr"}', '[1]', 'null', '"s"',
];

test('the dashboard reads a declaration exactly as the queue does', () => {
  const diffs = [];
  for (const text of TEXTS) {
    const a = parseTaskDeclaration(text); const b = queueParse(text);
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`parse ${text}`);
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      const da = applyTaskDefaults({ ...a }); const db = queueDefaults({ ...b });
      if (JSON.stringify(da) !== JSON.stringify(db)) diffs.push(`defaults ${text}: page ${JSON.stringify(da)} queue ${JSON.stringify(db)}`);
    }
  }
  assert.deepEqual(diffs, []);
});
