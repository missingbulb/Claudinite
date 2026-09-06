import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The same few lines of DOM the other view tests use — enough for what a renderer
// touches, and no browser engine to assert that a div got a class.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; this.attrs = {}; this.hidden = false; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  get text() {
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text))].join('');
  }
  all(tag) {
    const hit = this.tagName === tag ? [this] : [];
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.all(tag));
    return hit;
  }
}

let renderBoard;
let quietLine;

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    createElementNS: (ns, tag) => new FakeEl(tag),
  };
  ({ renderBoard, quietLine } = await import('../board-view.mjs'));
});

const REPO = 'an-owner/TicketWatch';
const NOW = Date.UTC(2026, 8, 6, 12);

const axis = {
  now: NOW, from: NOW - 86400e3, to: NOW + 86400e3, dailyHour: 6,
  days: [{ day: '2026-09-06', start: NOW - 43200e3, anchorAt: NOW - 21600e3, today: true }],
};

const board = (rows) => ({
  axis,
  groups: [{ id: 'now', title: 'Now', count: rows.length, sentence: 'one open PR', shown: rows, more: 0, all: rows }],
  quiet: { total: 0, rotting: 0, quickWin: 0, needsDecision: 0, items: [] },
  edges: [],
});

const prRow = {
  id: 'pr:43', kind: 'pr', gutter: '#43 → #42', title: 'Fix the thing', openedAt: NOW - 3600e3,
  waits: true, why: 'waits for a person', marks: [{ kind: 'bar', from: NOW - 3600e3, to: NOW, flag: true }],
};

// An SVG anchor gets its href through `setAttribute`, a DOM one through the property
// `el` assigns — the board draws both.
const hrefs = (node) => node.all('a').map((a) => a.attrs.href ?? a.href);

test('a row\'s gutter opens what it names — both numbers, when it names two', () => {
  const svg = renderBoard(board([prRow]), { repo: REPO });
  assert.deepEqual(hrefs(svg), [
    `https://github.com/${REPO}/issues/43`,
    `https://github.com/${REPO}/issues/42`,
  ]);
  assert.match(svg.text, /#43 → #42/, 'the gutter still reads as one string');
});

test('the issue a finding blames is a link, because that is the reader\'s next click', () => {
  const broken = {
    id: 'item:50', kind: 'item', gutter: '#50', title: 'a blocked item', at: null, broken: true,
    why: 'no one is scheduled to close #7', finding: 'no one is scheduled to close #7',
    marks: [{ kind: 'unmarked', at: null }],
  };
  assert.ok(hrefs(renderBoard(board([broken]), { repo: REPO })).includes(`https://github.com/${REPO}/issues/7`));
});

test('with no repo to link against, the board still draws its text', () => {
  const svg = renderBoard(board([prRow]));
  assert.equal(hrefs(svg).length, 0);
  assert.match(svg.text, /#43 → #42/);
});

test('every issue in the quiet tail is a link, and its title stays beside it', () => {
  const quiet = {
    total: 1, rotting: 1, quickWin: 0, needsDecision: 0,
    items: [{ number: 88, title: 'a plain issue on no edge', idleDays: 30, quickWin: false, needsDecision: false }],
  };
  const node = quietLine(quiet, { repo: REPO });
  assert.deepEqual(hrefs(node), [`https://github.com/${REPO}/issues/88`]);
  assert.match(node.text, /#88.*a plain issue on no edge.*idle 30 d/);
});
