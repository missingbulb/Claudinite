import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPrune, resolveRetentionDays, DEFAULT_RETENTION_DAYS } from '../../../tasks/logs-prune/prune-logs.mjs';
import { logFilename } from '../../../capture-log.mjs';

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
  const { readRetentionDays } = await import('../../../../../packs/claudinite-growth/tasks/logs-prune/worker.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'claudinite-prune-test-'));
  const write = (config) => writeFileSync(join(root, '.claudinite-settings.json'), JSON.stringify(config));

  write({ packs: ['basics', { id: 'claudinite-growth', config: { retention_days: 10 } }] });
  assert.equal(readRetentionDays(root), 10);

  // No miss reads as a number: the prune's one failure direction is deleting what
  // it should not. `undefined` is "said nothing" (the default answers it) and
  // `null` is "cannot tell" (nothing does) — the case below covers which is which.
  write({ packs: ['claudinite-growth'] });
  assert.equal(readRetentionDays(root), undefined);
  write({ packs: [{ id: 'other', config: { retention_days: 10 } }] });
  assert.equal(readRetentionDays(root), null);
  write({ packs: [{ id: 'claudinite-growth', config: { retention_days: '10' } }] });
  assert.equal(readRetentionDays(root), null);
  writeFileSync(join(root, '.claudinite-settings.json'), '{ not json');
  assert.equal(readRetentionDays(root), null);
});

// --- the retention default (#1620) -------------------------------------------

test('an absent retention resolves to the documented default, not to "off"', () => {
  for (const declared of [undefined, null]) {
    assert.equal(resolveRetentionDays(declared), DEFAULT_RETENTION_DAYS);
  }
  assert.equal(DEFAULT_RETENTION_DAYS, 10, 'the floor the pack has recommended in prose all along');
});

test('a declared retention overrides the default', () => {
  assert.equal(resolveRetentionDays(30), 30);
  assert.equal(resolveRetentionDays(1), 1);
});

test('a non-positive retention is the explicit capture-only opt-out', () => {
  // What "unset" used to mean. A member that wants the old behaviour has to say so
  // now, which is the whole point: absence can no longer express a decision.
  for (const declared of [0, -1]) {
    assert.equal(resolveRetentionDays(declared), null, `retention ${declared} must turn the prune off`);
  }
});

test('an unparsable retention is unknown, and unknown never resolves to the default', () => {
  // The prune's one failure direction is deleting what it should not, so anything
  // we cannot read as a number turns it off rather than falling back to 10 days.
  for (const declared of ['10', NaN, Infinity, {}, [], true]) {
    assert.equal(resolveRetentionDays(declared), null, `${JSON.stringify(declared)} must not become the default`);
  }
});

test('the resolved default deletes exactly what a declared 10 would', () => {
  const viaDefault = planPrune({ names: [OLD, YOUNG], retentionDays: resolveRetentionDays(undefined), now: NOW });
  const viaDeclared = planPrune({ names: [OLD, YOUNG], retentionDays: 10, now: NOW });
  assert.deepEqual(viaDefault.delete, viaDeclared.delete);
  assert.equal(viaDefault.off, false);
});

test('readRetentionDays separates "said nothing" from "cannot tell"', async () => {
  const { readRetentionDays } = await import('../../../../../packs/claudinite-growth/tasks/logs-prune/worker.mjs');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'claudinite-prune-default-test-'));
  const settings = join(root, '.claudinite-settings.json');
  const write = (config) => writeFileSync(settings, JSON.stringify(config));

  // Declared with no config: the pack said nothing, so the default applies.
  write({ packs: ['claudinite-growth'] });
  assert.equal(readRetentionDays(root), undefined);
  assert.equal(resolveRetentionDays(readRetentionDays(root)), DEFAULT_RETENTION_DAYS);

  write({ packs: [{ id: 'claudinite-growth', config: {} }] });
  assert.equal(readRetentionDays(root), undefined);

  // A declared number still wins, opt-out included.
  write({ packs: [{ id: 'claudinite-growth', config: { retention_days: 30 } }] });
  assert.equal(readRetentionDays(root), 30);
  write({ packs: [{ id: 'claudinite-growth', config: { retention_days: 0 } }] });
  assert.equal(resolveRetentionDays(readRetentionDays(root)), null);

  // Cannot tell: unreadable settings, and a value that is not a number. Both are
  // `null` — the state the worker refuses to prune on, distinct from `undefined`.
  write({ packs: [{ id: 'claudinite-growth', config: { retention_days: '10' } }] });
  assert.equal(readRetentionDays(root), null);
  writeFileSync(settings, '{ not json');
  assert.equal(readRetentionDays(root), null);
  rmSync(settings);
  assert.equal(readRetentionDays(root), null);
});
