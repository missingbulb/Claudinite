import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  digestDates, digestPath, parseDigest, linkRuns, digestEntry,
} from '../../packs/claudinite-dashboard/digest.mjs';

const NOW = Date.parse('2026-08-18T09:00:00Z');

// The shape the fleet-digest task's own contract mandates — plain text, `• ` items,
// bare URLs, no markdown.
const BRIEF = `Fleet operations — 2026-08-17

Yesterday's biggest work:

• TicketWatch — #289 Ticket refresh now recovers from partial API failures. https://github.com/an-owner/TicketWatch/pull/289

• LaughCounter — #147 New release pipeline. https://github.com/an-owner/LaughCounter/pull/147

Worth returning to:

• an-owner/CrosswordChat — last meaningful change 2026-07-29: #157 Store release automation. https://github.com/an-owner/CrosswordChat/pull/157

Three weeks quiet. Worth a look.
`;

test('the two days shown are yesterday and the day before, never today', () => {
  assert.deepEqual(digestDates(NOW), ['2026-08-17', '2026-08-16']);
});

test('the path is the configured directory, with a sane default', () => {
  assert.equal(digestPath('digests', '2026-08-17'), 'digests/2026-08-17.md');
  assert.equal(digestPath('briefs/fleet/', '2026-08-17'), 'briefs/fleet/2026-08-17.md');
  assert.equal(digestPath(undefined, '2026-08-17'), 'digests/2026-08-17.md');
});

test('a bare URL becomes a link run, and the text around it survives', () => {
  const runs = linkRuns('see https://example.com/a/1 for it.');
  assert.deepEqual(runs.map((r) => r.text), ['see ', 'https://example.com/a/1', ' for it.']);
  assert.equal(runs[1].href, 'https://example.com/a/1');
  // Sentence punctuation is not part of the URL.
  assert.equal(linkRuns('at https://example.com/a.').find((r) => r.href).text, 'https://example.com/a');
});

test('the brief parses into a title, sections, items and the closing paragraph', () => {
  const blocks = parseDigest(BRIEF);
  assert.equal(blocks[0].kind, 'title');
  assert.equal(blocks[0].runs.map((r) => r.text).join(''), 'Fleet operations — 2026-08-17');
  assert.deepEqual(blocks.map((b) => b.kind),
    ['title', 'section', 'item', 'item', 'section', 'item', 'para']);
  assert.equal(blocks[2].runs.filter((r) => r.href).length, 1);
  // The colon belongs to the section's syntax, not to its words.
  assert.equal(blocks[1].runs.map((r) => r.text).join(''), "Yesterday's biggest work");
});

test('a markdown-flavoured brief still reads as prose', () => {
  const blocks = parseDigest('# Fleet operations\n\n## Work\n\n- did a thing\n');
  assert.deepEqual(blocks.map((b) => b.kind), ['title', 'section', 'item']);
  assert.equal(blocks[2].runs.map((r) => r.text).join(''), 'did a thing');
});

test('a day with no file is a normal state, not an error', () => {
  const e = digestEntry('2026-08-17', null);
  assert.equal(e.state, 'missing');
  assert.equal(e.error, null);
  assert.deepEqual(e.blocks, []);
});

test('a read that failed is its own state, distinct from a day nobody wrote', () => {
  const e = digestEntry('2026-08-17', null, { status: 403, message: 'nope' });
  assert.equal(e.state, 'unreadable');
  assert.equal(e.error.status, 403);
});

test('an empty file is neither missing nor written', () => {
  assert.equal(digestEntry('2026-08-17', '\n  \n').state, 'empty');
  assert.equal(digestEntry('2026-08-17', BRIEF).state, 'written');
});
