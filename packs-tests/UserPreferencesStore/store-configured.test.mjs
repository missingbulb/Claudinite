import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../packs/UserPreferencesStore/store-configured.mjs';

// The rule that keeps a declared pack from being silently inert. Pure over the
// context's normalized per-pack config view, so no repo fixture is needed.
const ctx = (packConfig) => ({ config: { packConfig } });

test('a resolvable store is the healthy case and says nothing', () => {
  assert.deepEqual(rule.run(ctx({ UserPreferencesStore: { repo: 'owner/name' } })), []);
  assert.deepEqual(rule.run(ctx({ UserPreferencesStore: { repo: 'o/n', path: 'team' } })), []);
});

test('a declared pack with no store is reported, with the fix in the finding', () => {
  const [f] = rule.run(ctx({}));
  assert.equal(f.rule, 'preferences-store-configured');
  assert.equal(f.file, '.claudinite-checks.json');
  assert.match(f.what, /declared but names no store/);
  assert.match(f.fix, /"repo": "owner\/name"/);
});

test('a store that does not resolve is reported as such — not as "none"', () => {
  // The two are different mistakes: one is an unfinished adoption, the other is a
  // typo someone believes is working. The finding quotes what it found.
  const [f] = rule.run(ctx({ UserPreferencesStore: { repo: 'ownername' } }));
  assert.match(f.what, /does not resolve/);
  assert.match(f.what, /ownername/);
});

test('advisory, because the failure is a lost nicety and never a broken repo', () => {
  // A project mid-adoption — declared, interview unanswered — sits here legitimately
  // for a while; blocking would make that state a build break.
  assert.equal(rule.severity, 'advisory');
});
