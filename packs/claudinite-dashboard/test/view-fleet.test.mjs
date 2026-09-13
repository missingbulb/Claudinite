import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The same small fake DOM the other view tests use: these renderers touch
// `document.createElement` and nothing else, and the real page is what proves the CSS.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  get classList() { return { add: (c) => { this.className = `${this.className} ${c}`.trim(); } }; }
  get text() {
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text))].join('');
  }
  find(pred) {
    const hit = [];
    if (pred(this)) hit.push(this);
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.find(pred));
    return hit;
  }
}

let ctaCell, claudeRequest;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  ({ ctaCell, claudeRequest } = await import('../src/views/view-fleet.mjs'));
});

const links = (cell) => cell.find((n) => n.tagName === 'a').map((a) => [a.href, a.textContent]);
const buttons = (cell) => cell.find((n) => n.tagName === 'button');

// EVERY ROW ENDS IN ONE THING TO DO, and what that is follows the member's state
// (owner, 2026-09-13). The states differ in KIND, not only in wording: two of them are
// a person's own edit, which this page can only hand them the words for.

test('an archived repo sends the reader to GitHub, which is the only place it can be undone', () => {
  assert.deepEqual(links(ctaCell({ repo: 'o/attic', status: 'archived', outOfFleet: true })),
    [['https://github.com/o/attic/settings', 'Unarchive →']]);
});

test('an ignored repo offers the request to paste into Claude, naming the repo and the key', () => {
  const s = { repo: 'o/left-out', status: 'ignored', outOfFleet: true };
  assert.deepEqual(links(ctaCell(s)), [], 'the exclude list is a file to edit, not a page to visit');
  assert.equal(buttons(ctaCell(s)).length, 1);
  const request = claudeRequest(s);
  assert.match(request, /o\/left-out/);
  assert.match(request, /config\.exclude/);
});

test('a dormant member offers the same shape, against its own declaration', () => {
  const s = { repo: 'o/asleep', status: 'adopted', dormant: true };
  assert.equal(buttons(ctaCell(s)).length, 1);
  const request = claudeRequest(s);
  assert.match(request, /o\/asleep/);
  assert.match(request, /"dormant": true/);
  assert.match(request, /claudinite-tasks/);
});

test('an awake member points at its own worst item, with the reason on the link', () => {
  const cell = ctaCell({
    repo: 'o/a',
    status: 'adopted',
    top: { number: 41, url: 'https://github.com/o/a/issues/41', why: '3 days parked for a person' },
    work: { issues: 2, prs: 1 },
  });
  assert.deepEqual(links(cell), [['https://github.com/o/a/issues/41', 'Advance #41 →']]);
  assert.equal(cell.find((n) => n.title === '3 days parked for a person').length, 1);
});

test('with nothing parked, pull requests come before issues', () => {
  const prs = ctaCell({ repo: 'o/a', status: 'adopted', top: null, work: { issues: 4, prs: 2 } });
  assert.deepEqual(links(prs), [['https://github.com/o/a/pulls', 'Review 2 PRs →']]);
  const issues = ctaCell({ repo: 'o/a', status: 'adopted', top: null, work: { issues: 1, prs: 0 } });
  assert.deepEqual(links(issues), [['https://github.com/o/a/issues', 'Pick from 1 issue →']]);
});

// The one cell on the page that asks for nothing. It is a state of its own — not an
// empty cell, which reads as a column the page failed to fill.
test('a member with nothing parked and nothing open gets the smile', () => {
  const cell = ctaCell({ repo: 'o/a', status: 'adopted', top: null, work: { issues: 0, prs: 0 } });
  assert.deepEqual(links(cell), []);
  assert.equal(cell.text, '🙂');
  assert.equal(cell.find((n) => n['aria-label'] === 'nothing waiting').length, 1,
    'the smile carries its meaning for a reader who cannot see it');
});

test('a repo that does not run Claudinite still has somewhere to go', () => {
  assert.deepEqual(links(ctaCell({ repo: 'o/plain', status: 'not-adopted' })),
    [['https://github.com/o/plain', 'Open on GitHub →']]);
});
