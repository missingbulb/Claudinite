import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/store-configured.mjs';

// The rule that keeps a declared pack from being silently inert. Pure over the
// context's normalized per-pack config view, so no repo fixture is needed.
const ctx = (packConfig) => ({ config: { packConfig } });

test('a resolvable store is the healthy case and says nothing', () => {
  assert.deepEqual(rule.run(ctx({ 'claude-code-web-users-support': { repo: 'owner/name' } })), []);
  assert.deepEqual(rule.run(ctx({ 'claude-code-web-users-support': { repo: 'o/n', path: 'team' } })), []);
});

test('a declared pack with no store is reported, with the fix in the finding', () => {
  const [f] = rule.run(ctx({}));
  assert.equal(f.rule, 'preferences-store-configured');
  // A project mid-adoption sits here legitimately for a while; blocking would make that a build break.
  assert.equal(f.severity, 'advisory');
  assert.equal(f.file, '.claudinite-settings.json');
  assert.match(f.what, /declared but names no store/);
  assert.match(f.fix, /"repo": "owner\/name"/);
});

test('a store that does not resolve is reported as such — not as "none"', () => {
  // The two are different mistakes: one is an unfinished adoption, the other is a
  // typo someone believes is working. The finding quotes what it found.
  const [f] = rule.run(ctx({ 'claude-code-web-users-support': { repo: 'ownername' } }));
  assert.match(f.what, /does not resolve/);
  assert.match(f.what, /ownername/);
});
