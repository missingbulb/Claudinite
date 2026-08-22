import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The same few lines of DOM the other view tests use — enough for what a renderer
// touches, and no browser engine to assert that a div got a class.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  get classList() { return { add: (c) => { this.className = `${this.className} ${c}`.trim(); } }; }
  get text() {
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text))].join('');
  }
  find(cls) {
    const hit = [];
    if (this.className.split(' ').includes(cls)) hit.push(this);
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.find(cls));
    return hit;
  }
}

let leadCard;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  ({ leadCard } = await import('./ui.mjs'));
});

const candidate = (over = {}) => ({
  kind: 'item',
  repo: 'an-owner/TicketWatch',
  level: 'critical',
  why: 'parked broken — holding the task\'s lane',
  more: [],
  number: 42,
  title: '[claudinite-work] basics/baselining',
  key: 'basics/baselining',
  idleMs: 3 * 86400e3,
  url: 'https://github.com/an-owner/TicketWatch/issues/42',
  ...over,
});

test('the card names the work, its repo and the issue to open', () => {
  const card = leadCard(candidate());
  assert.match(card.className, /lvl-critical/);
  assert.match(card.text, /holding the task's lane/);
  assert.match(card.text, /an-owner\/TicketWatch/);
  assert.match(card.text, /#42/);
  assert.equal(card.find('lead-act')[0].href, 'https://github.com/an-owner/TicketWatch/issues/42');
});

test('how long it has been wrong is said, when the item knows', () => {
  assert.match(leadCard(candidate()).text, /untouched for 3d/);
  assert.doesNotMatch(leadCard(candidate({ idleMs: null })).text, /untouched/);
});

test('a repo-level fault opens the repo, since there is no issue to open', () => {
  const card = leadCard(candidate({
    kind: 'repo', number: null, title: null, key: null, idleMs: null,
    why: 'scheduler last run failed', url: 'https://github.com/an-owner/TicketWatch',
  }));
  assert.equal(card.find('lead-act')[0].textContent, 'Open the repo');
  assert.doesNotMatch(card.text, /#/);
});

test('what is behind the one is a count, never a second block of work', () => {
  assert.match(leadCard(candidate(), { rest: 4 }).text, /4 more after this one/);
  assert.doesNotMatch(leadCard(candidate(), { rest: 0 }).text, /more after/);
});

test('nothing to prod about is its own card, and it is not coloured as a fault', () => {
  const card = leadCard(null);
  assert.match(card.className, /lvl-ok/);
  assert.match(card.text, /Nothing is waiting on you/);
});
