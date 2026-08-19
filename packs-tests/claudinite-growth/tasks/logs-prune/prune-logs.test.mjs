import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPrune } from '../../../../packs/claudinite-growth/tasks/logs-prune/prune-logs.mjs';
import { logFilename } from '../../../../packs/claudinite-growth/capture-log.mjs';

const NOW = '2026-07-22T00:00:00.000Z';
const log = (iso, issue = 7, session = 'sess-a') => logFilename(iso, issue, session);

const OLD = log('2026-07-01T09:40:00.000Z');   // 20 days before NOW
const YOUNG = log('2026-07-21T09:40:00.000Z', 8, 'sess-b'); // 0.6 days

test('a capture past retention is deletable; a younger one is not', () => {
  const plan = planPrune({ names: [OLD, YOUNG, 'README.md'], retentionDays: 10, now: NOW });
  assert.deepEqual(plan.delete, [OLD]);
  assert.equal(plan.logCount, 2, 'the branch README is not a capture');
});

test('retention unset or non-positive turns the prune off entirely', () => {
  for (const retentionDays of [undefined, null, 0, -1, '10']) {
    const plan = planPrune({ names: [OLD], retentionDays, now: NOW });
    assert.deepEqual(plan.delete, [], `retention ${JSON.stringify(retentionDays)} must delete nothing`);
    assert.equal(plan.off, true, 'and it says so, rather than reporting an empty prune as a completed one');
  }
});

test('the retention boundary is strictly past', () => {
  const exactly = log('2026-07-12T00:00:00.000Z'); // exactly 10 days
  assert.deepEqual(planPrune({ names: [exactly], retentionDays: 10, now: NOW }).delete, []);
  const past = log('2026-07-11T23:00:00.000Z');
  assert.deepEqual(planPrune({ names: [past], retentionDays: 10, now: NOW }).delete, [past]);
});

test('a mixed branch deletes exactly the aged captures', () => {
  const alsoOld = log('2026-07-02T00:00:00.000Z', 0, 'sess-c');
  const plan = planPrune({ names: [OLD, YOUNG, alsoOld, 'README.md'], retentionDays: 10, now: NOW });
  assert.deepEqual(plan.delete.sort(), [OLD, alsoOld].sort());
  assert.equal(plan.logCount, 3);
});

// --- the worker's one pure read ----------------------------------------------

test('readRetentionDays takes this pack own entry config, and nothing else', async () => {
  const { readRetentionDays } = await import('../../../../packs/claudinite-growth/tasks/logs-prune/worker.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'claudinite-prune-test-'));
  const write = (config) => writeFileSync(join(root, '.claudinite-checks.json'), JSON.stringify(config));

  write({ packs: ['basics', { id: 'claudinite-growth', config: { retention_days: 10 } }] });
  assert.equal(readRetentionDays(root), 10);

  // Every miss reads as "unset", never as a number: the prune's one failure
  // direction is deleting what it should not.
  write({ packs: ['claudinite-growth'] });
  assert.equal(readRetentionDays(root), null);
  write({ packs: [{ id: 'other', config: { retention_days: 10 } }] });
  assert.equal(readRetentionDays(root), null);
  write({ packs: [{ id: 'claudinite-growth', config: { retention_days: '10' } }] });
  assert.equal(readRetentionDays(root), null);
  writeFileSync(join(root, '.claudinite-checks.json'), '{ not json');
  assert.equal(readRetentionDays(root), null);
});
