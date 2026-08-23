import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule, { contractChanges, carriesConsumers } from '../workRules/consumer-safe-change.mjs';

const SCHEMA = 'engine/pack_loader/pack-schema.mjs';
const STUB = 'engine/scheduler/stubs/claudinite-scheduler.yml';
const EXECUTOR_STUB = 'engine/scheduler/stubs/claudinite-executor.yml';
const RECORD = 'engine/migrations/2026-08-01-thing/migration.mjs';
const PACK_RECORD = 'packs/claudinite-fleet-sheepdog/migrations/2026-08-01-thing/migration.mjs';
const FIXTURES = 'vendoring/rehearsal/fixtures.mjs';

const BLOCKING_RULE = `import { finding } from '../x.mjs';
const rule = {
  id: 'demo',
  severity: 'blocking',
  run() { return []; },
};
export default rule;
`;

const ADVISORY_RULE = BLOCKING_RULE.replace("'blocking'", "'advisory'");

// The work context a work rule receives — only the three members this rule reads.
// `base` defaults to empty, so a fixture file reads as newly added unless a test
// says otherwise.
const work = (changedFiles, files = {}, base = {}) => ({
  changedFiles,
  read: (f) => files[f] ?? null,
  readBase: (f) => base[f] ?? null,
});

// --- what counts as a contract surface --------------------------------------

test('the manifest vocabulary is a contract surface — this is #555\'s exact file', () => {
  const out = contractChanges([SCHEMA], () => null);
  assert.equal(out.length, 1);
  assert.match(out[0].what, /manifest vocabulary/);
});

test('either workflow stub is a contract surface — members vendor both verbatim', () => {
  assert.equal(contractChanges([STUB], () => null).length, 1);
  // The executor's too: its event trigger names label strings literally, so a
  // vocabulary change there is exactly the kind a member has to be carried across.
  assert.equal(contractChanges([EXECUTOR_STUB], () => null).length, 1);
  assert.equal(contractChanges([STUB, EXECUTOR_STUB], () => null).length, 2);
});

test('a rule promoted from advisory to blocking is a contract surface', () => {
  const out = contractChanges(['packs/basics/demo.mjs'], () => BLOCKING_RULE, () => ADVISORY_RULE);
  assert.equal(out.length, 1);
  assert.match(out[0].what, /became blocking/);
});

test('a brand-new blocking rule is a contract surface — it has no base to have asked for', () => {
  assert.equal(contractChanges(['packs/basics/demo.mjs'], () => BLOCKING_RULE, () => null).length, 1);
});

test('editing a rule that was ALREADY blocking is not — it asks nothing new of a member', () => {
  const edited = BLOCKING_RULE.replace("id: 'demo'", "id: 'demo', doc: 'packs/basics/RULES.md'");
  assert.deepEqual(contractChanges(['packs/basics/demo.mjs'], () => edited, () => BLOCKING_RULE), []);
});

test('a changed rule that stays advisory is not — it cannot turn a member red', () => {
  assert.deepEqual(contractChanges(['packs/basics/demo.mjs'], () => ADVISORY_RULE, () => ADVISORY_RULE), []);
});

// The narrowness is the point: a rule that fires on every canon commit gets
// turned off, and is then worth nothing on the day it matters.
test('ordinary engine and pack edits are not contract surfaces', () => {
  assert.deepEqual(contractChanges(['engine/scheduler/queue/executor.mjs', 'packs/node/README.md'], () => 'whatever'), []);
});

test('test files are never contract surfaces, even when they contain a blocking rule', () => {
  assert.deepEqual(contractChanges(['packs/basics/x.test.mjs'], () => BLOCKING_RULE), []);
  assert.deepEqual(contractChanges(['engine-tests/x.test.mjs'], () => BLOCKING_RULE), []);
});

// --- what discharges it -----------------------------------------------------

test('carriesConsumers recognises a migration record and a fixture change', () => {
  assert.deepEqual(carriesConsumers([RECORD]), { migration: true, fixture: false });
  // A record lives under the flow that owns it, so a pack's own record counts too —
  // the relocation in #768 left this pattern matching a path no record can have.
  assert.deepEqual(carriesConsumers([PACK_RECORD]), { migration: true, fixture: false });
  assert.deepEqual(carriesConsumers(['migrations/2026-08-01-thing/migration.mjs']), { migration: false, fixture: false });
  assert.deepEqual(carriesConsumers([FIXTURES]), { migration: false, fixture: true });
  assert.deepEqual(carriesConsumers(['engine/x.mjs']), { migration: false, fixture: false });
});

// --- the rule ---------------------------------------------------------------

test('a bare schema change is blocked — the #555 shape', () => {
  const out = rule.run(work([SCHEMA]));
  assert.equal(out.length, 1);
  assert.match(out[0].what, /carries no migration record and no rehearsal fixture/);
});

test('a schema change WITH a migration record passes', () => {
  assert.deepEqual(rule.run(work([SCHEMA, RECORD])), []);
});

test('a schema change WITH a rehearsal fixture passes — additive changes need only this', () => {
  assert.deepEqual(rule.run(work([SCHEMA, FIXTURES])), []);
});

test('a change touching nothing contractual passes, and an empty diff is a no-op', () => {
  assert.deepEqual(rule.run(work(['README.md'])), []);
  assert.deepEqual(rule.run(work([])), []);
});

test('the rule is work-scoped and blocking — it judges the change in front of you', () => {
  assert.equal(rule.scope, 'work');
  assert.equal(rule.severity, 'blocking');
});

test('a rule in the canon\'s own local packs is out of scope — no consumer can receive it', () => {
  // The vendor set carries engine/ and packs/ only, so a local-pack rule runs in this
  // repo and nowhere else: it can never turn a member red, and demanding a migration
  // for it would be a toll on every canon-only rule.
  const local = '.claudinite/local/packs/claudinite/new-rule.mjs';
  assert.deepEqual(contractChanges([local], () => BLOCKING_RULE, () => null), []);
  assert.deepEqual(rule.run(work([local], { [local]: BLOCKING_RULE })), []);
  // …while the same module under a shipped pack still counts.
  const shipped = 'packs/basics/new-rule.mjs';
  assert.equal(contractChanges([shipped], () => BLOCKING_RULE, () => null).length, 1);
});
