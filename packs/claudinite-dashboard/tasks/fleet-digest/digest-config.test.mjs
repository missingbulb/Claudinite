// Run with `node --test packs/claudinite-dashboard/tasks/fleet-digest/*.test.mjs`.
//
// What these prove is mostly about DEFAULTS, because the config's whole promise is
// that a fleet can adopt the digest without answering a single question — and that
// the two knobs the owner asked to be configurable really are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDigestConfig, parseNudge, DEFAULT_PICK, DEFAULT_QUIET_DAYS } from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/digest-config.mjs';

const withDigest = (digest) => ({ packs: [{ id: 'sheepdog', config: { owner: 'missingbulb', ...(digest === undefined ? {} : { digest }) } }] });

test('an absent digest block is a valid one — the file still gets written', () => {
  const c = parseDigestConfig(withDigest(undefined));
  assert.equal(c.pick, DEFAULT_PICK);
  assert.equal(c.shortlist, 6, 'four picked from six — the overfetch the task depends on');
  assert.deepEqual(c.nudge, { enabled: true, quietDays: DEFAULT_QUIET_DAYS });
});

test('a repo with no sheepdog entry at all still parses to defaults', () => {
  assert.equal(parseDigestConfig({ packs: ['basics'] }).pick, DEFAULT_PICK);
});

// --- where the fleet keys come from, after the task moved packs -------------------

const entry = (id, config) => ({ id, config });

test('this pack\'s own entry is where the fleet keys are read', () => {
  const c = parseDigestConfig({
    packs: [entry('claudinite-dashboard', { owner: 'An-Owner', exclude: ['An-Owner/Scratch'], digest: { pick: 2 } })],
  }, 'an-owner/Enforcer');

  assert.equal(c.owner, 'an-owner', 'lowercased, because it is compared against API-supplied logins');
  assert.ok(c.exclude.has('an-owner/scratch'));
  assert.equal(c.pick, 2);
  assert.deepEqual(c.source, { owner: 'entry', exclude: 'entry', digest: 'entry' });
});

test('the sheepdog entry is the legacy source, so a moved task covers the same fleet', () => {
  // An enforcer declared owner/exclude on its sheepdog entry long before this task
  // moved here. Reading only this pack's entry would silently widen the brief to every
  // repo under the owner — a dropped exclude list is exactly the parameter that fails
  // quietly, so the fallback exists and reports itself.
  const c = parseDigestConfig({
    packs: [
      entry('sheepdog', { owner: 'an-owner', exclude: ['an-owner/scratch'], digest: { pick: 3 } }),
      entry('claudinite-dashboard', { canonRepo: 'an-owner/Claudinite' }),
    ],
  }, 'an-owner/Enforcer');

  assert.equal(c.owner, 'an-owner');
  assert.ok(c.exclude.has('an-owner/scratch'));
  assert.equal(c.pick, 3);
  assert.deepEqual(c.source, { owner: 'sheepdog', exclude: 'sheepdog', digest: 'sheepdog' });
});

test('this pack\'s entry wins over the legacy one, key by key', () => {
  const c = parseDigestConfig({
    packs: [
      entry('sheepdog', { owner: 'old-owner', exclude: ['old-owner/a'] }),
      entry('claudinite-dashboard', { owner: 'new-owner' }),
    ],
  }, 'new-owner/Enforcer');

  assert.equal(c.owner, 'new-owner');
  // `exclude` is not on the winning entry, so it still falls back rather than emptying.
  assert.ok(c.exclude.has('old-owner/a'));
  assert.deepEqual(c.source, { owner: 'entry', exclude: 'sheepdog', digest: 'default' });
});

test('an owner nobody configured is the owner of the repo the task runs in', () => {
  const c = parseDigestConfig({ packs: [entry('claudinite-dashboard', {})] }, 'An-Owner/Dashboard');
  assert.equal(c.owner, 'an-owner');
  assert.equal(c.exclude.size, 0);
  assert.deepEqual(c.source, { owner: 'repo', exclude: 'none', digest: 'default' });
});

test('there is no delivery config, and a stray key does not become one', () => {
  // The task writes a file and stops — nothing here sends anything. Left-over
  // delivery keys are ignored rather than half-honoured, so a config that still
  // carries one does not read as a transport that quietly never fires.
  const c = parseDigestConfig(withDigest({ email: 'someone@example.com', pick: 3 }));
  assert.equal(c.email, undefined);
  assert.equal(c.pick, 3, 'the keys it does own are unaffected');
});

test('pick is configurable and drives the shortlist size', () => {
  assert.equal(parseDigestConfig(withDigest({ pick: 3 })).shortlist, 5, 'ceil(3 * 1.5)');
  assert.equal(parseDigestConfig(withDigest({ pick: 6 })).shortlist, 9);
  assert.equal(parseDigestConfig(withDigest({ pick: 1 })).shortlist, 2);
});

test('a nonsense pick falls back rather than dispatching an agent to read forty PRs', () => {
  assert.equal(parseDigestConfig(withDigest({ pick: 0 })).pick, DEFAULT_PICK);
  assert.equal(parseDigestConfig(withDigest({ pick: -2 })).pick, DEFAULT_PICK);
  assert.equal(parseDigestConfig(withDigest({ pick: 'four' })).pick, DEFAULT_PICK);
  assert.equal(parseDigestConfig(withDigest({ pick: 400 })).pick, 10, 'clamped, not honoured');
  assert.equal(parseDigestConfig(withDigest({ pick: 4.7 })).pick, 4, 'floored');
});

test('the nudge switches off both ways it would actually be written', () => {
  assert.equal(parseNudge(false).enabled, false);
  assert.equal(parseNudge({ enabled: false }).enabled, false);
  assert.equal(parseDigestConfig(withDigest({ nudge: false })).nudge.enabled, false);
});

test('the nudge window is configurable, and keeps its window when switched off', () => {
  assert.deepEqual(parseNudge({ quietDays: 21 }), { enabled: true, quietDays: 21 });
  assert.deepEqual(parseNudge({ enabled: false, quietDays: 21 }), { enabled: false, quietDays: 21 });
  assert.equal(parseNudge({ quietDays: 0 }).quietDays, DEFAULT_QUIET_DAYS, 'a zero-day window is not a window');
  assert.equal(parseNudge({ quietDays: 'a week' }).quietDays, DEFAULT_QUIET_DAYS);
});

test('an unreadable nudge value defaults ON rather than guessing which half was meant', () => {
  assert.deepEqual(parseNudge(7), { enabled: true, quietDays: DEFAULT_QUIET_DAYS });
  assert.deepEqual(parseNudge('yes'), { enabled: true, quietDays: DEFAULT_QUIET_DAYS });
  assert.deepEqual(parseNudge(undefined), { enabled: true, quietDays: DEFAULT_QUIET_DAYS });
});

