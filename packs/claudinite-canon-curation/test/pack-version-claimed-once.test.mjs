import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rule from '../worldRules/pack-version-claimed-once.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');

// The world context a world rule receives — only the two members this rule reads.
const ctx = (files) => ({ files: Object.keys(files), read: (f) => files[f] ?? null });
const log = (...rows) => `# Version history\n\n| Version | Date | What changed |\n|---|---|---|\n`
  + rows.map(([v, what]) => `| ${v} | 2026-08-30 | ${what} |\n`).join('');

test('a log claiming each version once is clean', () => {
  assert.deepEqual(rule.run(ctx({
    'packs/demo/VERSIONS.md': log(['60830.2', 'Second.'], ['60830.1', 'First.']),
  })), []);
});

test('two rows claiming one version is the collision — one number, two trees', () => {
  const findings = rule.run(ctx({
    'packs/demo/VERSIONS.md': log(['60830.1', 'One branch.'], ['60830.1', 'The other branch.']),
  }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'packs/demo/VERSIONS.md');
  assert.equal(findings[0].line, 6);                    // the second claim, with the first named in the message
  assert.match(findings[0].what, /60830\.1 is claimed by two rows \(also line 5\)/);
});

test('each pack is asked on its own — one pack\'s version says nothing about another\'s', () => {
  assert.deepEqual(rule.run(ctx({
    'packs/demo/VERSIONS.md': log(['60830.1', 'Demo.']),
    'packs/other/VERSIONS.md': log(['60830.1', 'Other.']),
  })), []);
});

test('a log deeper than a pack root is not a pack\'s log', () => {
  assert.deepEqual(rule.run(ctx({
    'packs/demo/skills/x/VERSIONS.md': log(['60830.1', 'One.'], ['60830.1', 'Two.']),
  })), []);
});

test('a row whose first cell is not a version is another rule\'s question', () => {
  assert.deepEqual(rule.run(ctx({
    'packs/demo/VERSIONS.md': '| 60830.0 | — | Not a version. |\n| 60830.0 | — | Nor this. |\n',
  })), []);
});

// The tree's own logs, not a fixture: a check that has never met the real corpus
// proves only that its matching agrees with the shape the fixture spells.
test('the canon\'s own packs claim every version exactly once', () => {
  const tracked = execFileSync('git', ['ls-files', 'packs/*/VERSIONS.md'], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(tracked.length > 20, `expected the canon's packs to carry version logs, found ${tracked.length}`);
  const files = Object.fromEntries(tracked.map((f) => [f, readFileSync(join(REPO, f), 'utf8')]));
  assert.deepEqual(rule.run(ctx(files)).map((f) => `${f.file}: ${f.what}`), []);
});
