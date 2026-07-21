import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../checks_helpers/markdown.mjs';

test('extracts relative links with line numbers', () => {
  const links = extractLinks('intro\n\nsee [the doc](sub/doc.md) here\n');
  assert.equal(links.length, 1);
  assert.deepEqual(links[0], { label: 'the doc', target: 'sub/doc.md', line: 3 });
});

test('strips anchors and keeps backticked labels verbatim minus backticks', () => {
  const links = extractLinks('[`a/b.md`](a/b.md#section)\n');
  assert.equal(links[0].label, 'a/b.md');
  assert.equal(links[0].target, 'a/b.md');
});

test('skips external, mailto and pure-anchor links', () => {
  const text = '[x](https://e.com/a.md) [y](mailto:a@b.c) [z](#local)\n';
  assert.equal(extractLinks(text).length, 0);
});

test('skips links inside fenced code blocks', () => {
  const text = 'before\n```\n[gone](missing.md)\n```\n[kept](real.md)\n';
  const links = extractLinks(text);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'real.md');
});

test('extracts image links', () => {
  const links = extractLinks('![shot](img/a.png)\n');
  assert.equal(links[0].target, 'img/a.png');
});
