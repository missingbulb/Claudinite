import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPrune, markerFor, MARKER_SUFFIX } from '../../../../packs/grow_with_claudinite/tasks/logs-prune/prune-logs.mjs';
import { logFilename } from '../../../../packs/grow_with_claudinite/capture-log.mjs';

const NOW = '2026-07-22T00:00:00.000Z';
const log = (iso, issue = 7, session = 'sess-a') => logFilename(iso, issue, session);

const OLD = log('2026-07-01T09:40:00.000Z');   // 20 days before NOW
const YOUNG = log('2026-07-21T09:40:00.000Z', 8, 'sess-b'); // 0.6 days

test('a capture is deletable only when it is BOTH aged and marked', () => {
  // The whole point of the split: age is this task's arithmetic, but whether the
  // extract run ever read the log is a fact only the marker carries.
  const both = planPrune({ names: [OLD, markerFor(OLD)], retentionDays: 10, now: NOW });
  assert.deepEqual(both.delete, [OLD, markerFor(OLD)]);
  assert.deepEqual(both.holding, []);

  const agedOnly = planPrune({ names: [OLD], retentionDays: 10, now: NOW });
  assert.deepEqual(agedOnly.delete, []);
  assert.deepEqual(agedOnly.holding, [OLD], 'an unread capture is held, never aged out');

  const markedOnly = planPrune({ names: [YOUNG, markerFor(YOUNG)], retentionDays: 10, now: NOW });
  assert.deepEqual(markedOnly.delete, [], 'processed does not mean deletable — retention still governs');
});

test('retention unset or non-positive turns the prune off entirely', () => {
  for (const retentionDays of [undefined, null, 0, -1, '10']) {
    const plan = planPrune({ names: [OLD, markerFor(OLD)], retentionDays, now: NOW });
    assert.deepEqual(plan.delete, [], `retention ${JSON.stringify(retentionDays)} must delete nothing`);
    assert.equal(plan.off, true);
    assert.deepEqual(plan.holding, [], 'with the prune off nothing is "held" either — it is simply not running');
  }
});

test('the retention boundary is strictly past, and the branch README is not a capture', () => {
  const exactly = log('2026-07-12T00:00:00.000Z'); // exactly 10 days
  assert.deepEqual(planPrune({ names: [exactly, markerFor(exactly)], retentionDays: 10, now: NOW }).delete, []);
  const plan = planPrune({ names: ['README.md', YOUNG], retentionDays: 10, now: NOW });
  assert.equal(plan.logCount, 1);
  assert.deepEqual(plan.delete, []);
});

test('a marker whose capture is already gone is swept, whatever its age', () => {
  // Nothing else would ever remove it: a marker carries no stamp of its own, so
  // without this it outlives the capture it was about forever.
  const plan = planPrune({ names: [markerFor(YOUNG), 'README.md'], retentionDays: 10, now: NOW });
  assert.deepEqual(plan.delete, [markerFor(YOUNG)]);
});

test('an unparsable name with the marker suffix is left alone', () => {
  // The sweep above must key on "this marks a capture", not on the suffix alone.
  const plan = planPrune({ names: [`notes${MARKER_SUFFIX}`], retentionDays: 10, now: NOW });
  assert.deepEqual(plan.delete, []);
});

test('a mixed branch deletes only the aged-and-marked pairs', () => {
  const names = [OLD, markerFor(OLD), YOUNG, markerFor(YOUNG), log('2026-07-02T00:00:00.000Z', 0, 'sess-c'), 'README.md'];
  const plan = planPrune({ names, retentionDays: 10, now: NOW });
  assert.deepEqual(plan.delete, [OLD, markerFor(OLD)]);
  assert.deepEqual(plan.holding, [log('2026-07-02T00:00:00.000Z', 0, 'sess-c')]);
  assert.equal(plan.logCount, 3);
});

// --- the worker's one pure read ----------------------------------------------

test('readRetentionDays takes this pack own entry config, and nothing else', async () => {
  const { readRetentionDays } = await import('../../../../packs/grow_with_claudinite/tasks/logs-prune/worker.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'claudinite-prune-test-'));
  const write = (config) => writeFileSync(join(root, '.claudinite-checks.json'), JSON.stringify(config));

  write({ packs: ['basics', { id: 'grow_with_claudinite', config: { retention_days: 10 } }] });
  assert.equal(readRetentionDays(root), 10);

  // Every miss reads as "unset", never as a number: the prune's one failure
  // direction is deleting what it should not.
  write({ packs: ['grow_with_claudinite'] });
  assert.equal(readRetentionDays(root), null);
  write({ packs: [{ id: 'other', config: { retention_days: 10 } }] });
  assert.equal(readRetentionDays(root), null);
  write({ packs: [{ id: 'grow_with_claudinite', config: { retention_days: '10' } }] });
  assert.equal(readRetentionDays(root), null);
  writeFileSync(join(root, '.claudinite-checks.json'), '{ not json');
  assert.equal(readRetentionDays(root), null);
});
