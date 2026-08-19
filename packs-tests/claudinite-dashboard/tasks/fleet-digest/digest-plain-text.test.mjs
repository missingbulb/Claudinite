// See-it-fail proof for digest-plain-text. Run with `node --test packs-tests/claudinite-dashboard/tasks/fleet-digest/*.test.mjs`.
// The violating fixture is the shape every brief had before this rule — the markdown template
// task.md specified, which the notification renderer delivered as its own source code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../../../packs/claudinite-dashboard/tasks/fleet-digest/digest-plain-text.mjs';

// Only `read` and `allFiles` are touched; anything else would be a rule reaching too far.
const ctx = (fs) => ({ allFiles: Object.keys(fs), read: (p) => (p in fs ? fs[p] : null) });

// Fixture dates are 1999: a brief path dated in the years the fleet actually runs in would
// share a namespace with the real series (see dated-fixture-collision), and this file is a
// `.test.mjs` that rule scans. Assembled rather than written contiguously for the same reason.
const brief = (d) => `digests/${d}.md`;
const DATED = brief('1999-03-04');

const MARKDOWN_BRIEF = [
  '# Fleet operations — 1999-03-04',
  '',
  "## Yesterday's biggest work",
  '',
  '- **Claudinite** — [#750](https://github.com/missingbulb/Claudinite/pull/750) Fleet tasks now dispatch via each member\'s own scheduler.',
  '',
  '## Worth returning to',
  '',
  '**missingbulb/TLDR** — last meaningful change 1999-02-31: [#162](https://github.com/missingbulb/TLDR/pull/162) Convert the `Comment class:` rule to a check.',
  '',
].join('\n');

const PLAIN_BRIEF = [
  'Fleet operations — 1999-03-04',
  '',
  "Yesterday's biggest work:",
  '',
  '• Claudinite — #750 Fleet tasks now dispatch via each member\'s own scheduler. https://github.com/missingbulb/Claudinite/pull/750',
  '',
  'Worth returning to:',
  '',
  '• missingbulb/TLDR — last meaningful change 1999-02-31: #162 Convert the "Comment class:" rule to a check. https://github.com/missingbulb/TLDR/pull/162',
  '',
  'Eleven days quiet with nothing since — worth a look to see what is blocking it.',
  '',
].join('\n');

test('the markdown brief every day was written in is found', () => {
  const found = rule.run(ctx({ [DATED]: MARKDOWN_BRIEF }));
  assert.equal(found.length, 1, 'one finding per file, not per syntax');
  assert.equal(found[0].severity, 'blocking', 'the task\'s entire output arriving unreadable is a defect, not a transient');
  assert.equal(found[0].file, DATED);
  assert.equal(found[0].line, 1, 'points at the first place the reader would see it break');
  for (const syntax of ['ATX heading', 'list bullet', 'inline link', 'asterisk emphasis', 'backtick']) {
    assert.match(found[0].what, new RegExp(syntax), `${syntax} is named`);
  }
  assert.match(found[0].fix, /•/, 'the fix names the separator that survives the collapse');
});

test('the plain-text brief is clean', () => {
  assert.deepEqual(rule.run(ctx({ [DATED]: PLAIN_BRIEF })), [],
    'bare URLs, "• " separators and unmarked section labels are the whole vocabulary');
});

test('each syntax is caught on its own', () => {
  const only = (line) => rule.run(ctx({ [DATED]: `Fleet operations\n\n${line}\n` }));
  assert.match(only('# Heading')[0].what, /ATX heading/);
  assert.match(only('- an item')[0].what, /list bullet/);
  assert.match(only('* an item')[0].what, /list bullet/);
  assert.match(only('see [#12](https://example/pr/12) for it')[0].what, /inline link/);
  assert.match(only('**Claudinite** shipped')[0].what, /asterisk emphasis/);
  assert.match(only('the `pick` key')[0].what, /backtick/);
  assert.match(only('_Written by the fleet-digest task._')[0].what, /underscore emphasis/);
});

test('an underscore inside a word is not emphasis', () => {
  // Real briefs name real identifiers: DIGEST_BACKFILL_DAYS and FLEET_GITHUB_TOKEN are the
  // fleet's own override keys, and a rule that flagged them would push the brief into
  // paraphrasing facts rather than stating them.
  assert.deepEqual(rule.run(ctx({ [DATED]: 'Fleet operations\n\nBackfill via DIGEST_BACKFILL_DAYS over FLEET_GITHUB_TOKEN.\n' })), []);
});

test('only the dated briefs are subjects', () => {
  assert.deepEqual(rule.run(ctx({
    'digests/README.md': MARKDOWN_BRIEF,
    'packs/claudinite-dashboard/tasks/fleet-digest/task.md': MARKDOWN_BRIEF,
    'README.md': MARKDOWN_BRIEF,
  })), [], 'documentation about the series is read on GitHub, never sent, and is markdown on purpose');
});

test('inert where it does not apply', () => {
  assert.deepEqual(rule.run(ctx({})), []);
  assert.deepEqual(rule.run(ctx({ [DATED]: 'Fleet operations — 1999-03-04\n\nNothing merged.\n' })), []);
});

test('the landed series is guarded where it lives, not from here', () => {
  // The enforcer's own `digests/` is the series this rule exists for, and canon does not carry
  // one — a case that read it from here would either be skipped forever or, worse, assert
  // against repo state that only exists somewhere else. What canon owns is the RULE, so what
  // canon tests is the rule; the series itself is guarded by this same rule running as a world
  // check in the repo that writes it, every session and every CI run.
  //
  // The shape below is exactly what that world run does to a real brief, against the format the
  // worker and task.md both emit.
  const REAL = [
    'Fleet operations — 1999-03-04',
    '',
    "Yesterday's biggest work:",
    '',
    '• TicketWatch — #289 Ticket refresh now recovers from partial API failures. https://github.com/an-owner/TicketWatch/pull/289',
    '',
    'Worth returning to:',
    '',
    '• an-owner/CrosswordChat — last meaningful change 1999-02-25: #157 Store release automation. https://github.com/an-owner/CrosswordChat/pull/157',
    '',
    'Three weeks quiet — worth a look.',
    '',
  ].join('\n');
  assert.deepEqual(rule.run(ctx({ [DATED]: REAL })), []);
});
