import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAT_TASKS_PATH, FLAT_DASHBOARD_PATH } from '../src/read/flat.mjs';
import { USAGE_PATH, LEGACY_USAGE_PATH, TASKS_USAGE_PATH, LEGACY_TASKS_USAGE_PATH } from '../src/read/usage.mjs';
import { valuesPath, legacyValuesPath } from '../src/read/contributions.mjs';
import * as flat from '../../../engine/pack_loader/generate-flat-declarations.mjs';
import * as fold from '../../claudinite-tasks/tasks/usage-fold/worker.mjs';
import * as tasksFormat from '../../claudinite-tasks/src/items/tasks-usage-format.mjs';
import * as review from '../../claudinite-growth/tasks/usage-review/report.mjs';

// The page reads files other packs write, and cannot import them: it runs in the
// viewer's browser against other repos. So each path is spelled on both sides, and this
// holds the page's spelling to the writer's, the old paths included, since a page that
// looked for a moved file at neither path would show a member with history as empty.
const posix = (p) => p.split(/[\\/]/).join('/');

test('the page reads each file at the path its writer writes it', () => {
  assert.equal(FLAT_TASKS_PATH, posix(flat.FLAT_TASKS_FILE));
  assert.equal(FLAT_DASHBOARD_PATH, posix(flat.FLAT_DASHBOARD_FILE));
  assert.equal(USAGE_PATH, fold.USAGE_PATH);
  assert.equal(LEGACY_USAGE_PATH, fold.LEGACY_USAGE_PATH);
  assert.equal(TASKS_USAGE_PATH, tasksFormat.TASKS_USAGE_PATH);
  assert.equal(LEGACY_TASKS_USAGE_PATH, tasksFormat.LEGACY_TASKS_USAGE_PATH);
  assert.equal(valuesPath('claudinite-growth'), review.DASHBOARD_PATH); // @real-entity the one pack whose writer publishes dashboard values today
  assert.equal(legacyValuesPath('claudinite-growth'), review.LEGACY_PATHS[review.DASHBOARD_PATH]); // @real-entity as above
});
