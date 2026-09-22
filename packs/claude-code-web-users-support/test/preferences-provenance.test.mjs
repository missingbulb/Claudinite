import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../worldRules/preferences-provenance.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';

// See-it-fail proof for preferences-provenance: a rule with no marker, one whose marker
// names no file, and the clean shape — a marker naming a file in the person's own pack.
const STORE = { repo: 'owner/store' };
const ctx = (files, texts = {}, config = STORE) => ({
  files,
  config: { packConfig: config === null ? {} : { 'claude-code-web-users-support': config } },
  read: (p) => texts[p] ?? null,
  exists: (p) => files.includes(p),
});
const PREFS = '- **Ending a turn** — a blockquote callout. (turn-callout)\n\n- **Saying LGTM** — merges the change at hand.\n';

test('a rule with no marker, and one whose marker names no file, are each found at their line', () => {
  const found = runRule(rule, ctx(['preferences/a@b.c/RULES.md'], { 'preferences/a@b.c/RULES.md': PREFS }));
  assert.equal(found.length, 2);
  assert.equal(found[0].severity, 'advisory');
  assert.equal(found[0].line, 1);
  assert.match(found[0].what, /"Ending a turn" names preferences\/a@b\.c\/provenance\/turn-callout\.md, which does not exist/);
  assert.equal(found[1].line, 3);
  assert.match(found[1].what, /"Saying LGTM" ends with no marker/);
  assert.match(found[1].fix, /\(saying-lgtm\)/);
});

test("a marker naming a file in the person's own pack is clean", () => {
  const files = [
    'preferences/a@b.c/RULES.md',
    'preferences/a@b.c/provenance/turn-callout.md',
    'preferences/a@b.c/provenance/saying-lgtm.md',
  ];
  const texts = { 'preferences/a@b.c/RULES.md': PREFS.replace('at hand.', 'at hand. (saying-lgtm)') };
  assert.deepEqual(runRule(rule, ctx(files, texts)), []);
});

test("only the pack's own RULES.md is read, not every Markdown file in it", () => {
  // A person's pack carries a README, a skill body and its own provenance files; none of
  // them is a rule index, and reading one as if it were would report its every bullet.
  const files = ['preferences/a@b.c/skills/s/SKILL.md', 'preferences/a@b.c/provenance/turn-callout.md'];
  assert.deepEqual(runRule(rule, ctx(files, Object.fromEntries(files.map((f) => [f, PREFS])))), []);
});

test('inert where this repo is not the store, where the pack names none, and for files store-file-names already reports', () => {
  assert.deepEqual(runRule(rule, ctx(['src/app.js'], {})), []);
  assert.deepEqual(runRule(rule, ctx(['preferences/a@b.c/RULES.md'], { 'preferences/a@b.c/RULES.md': PREFS }, null)), []);
  assert.deepEqual(runRule(rule, ctx(['preferences/README.md', 'preferences/ariel/RULES.md'], { 'preferences/ariel/RULES.md': PREFS })), []);
});
