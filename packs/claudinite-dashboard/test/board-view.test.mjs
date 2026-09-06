import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The same few lines of DOM the other view tests use — enough for what a renderer
// touches, and no browser engine to assert that a div got a class.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; this.attrs = {}; this.hidden = false; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(type, fn) { (this.on ??= {})[type] = fn; }
  fire(type, ev = {}) { this.on?.[type]?.(ev); }
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

// The GUTTER's own anchors, which wrap text rather than a mark. The marks are links
// too now, to the same item, and they are `a lane mark is a link…`'s to assert.
const gutterHrefs = (node) => node.all('a').filter((a) => a.all('tspan').length).map((a) => a.attrs.href ?? a.href);

test('a row\'s gutter opens what it names — both numbers, when it names two', () => {
  const svg = renderBoard(board([prRow]), { repo: REPO });
  assert.deepEqual(gutterHrefs(svg), [
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


// --- what a mark opens, and what it says on the way -----------------------------------

// A mark IS its item. Clicking one used to fill a block under the board with a panel;
// it opens the thing itself now, which is where the reader was going anyway.
test('a lane mark is a link to the item its gutter names', () => {
  const svg = renderBoard(board([prRow]), { repo: REPO });
  const marks = svg.all('a').filter((a) => a.all('rect').length || a.all('circle').length || a.all('g').length);
  assert.ok(marks.length, 'the marks are anchors, not click handlers');
  assert.ok(marks.every((a) => a.attrs.href === `https://github.com/${REPO}/issues/43`),
    'every mark on the row opens the first item its gutter names');
});

// A cell is a task on a day and can hold several runs. One is a link to it; several
// have no single target, so they open the search that names exactly those numbers.
const gridBoard = (cells) => ({
  axis,
  groups: [{
    id: 'scheduled', title: 'Scheduled', count: 1, sentence: 'one task', grid: true, more: 0,
    shown: [{ key: 'a-pack/a-task', task: 'a-pack/a-task', pack: 'a-pack', cells, row: {} }],
    all: [],
  }],
  quiet: { total: 0, rotting: 0, quickWin: 0, needsDecision: 0, items: [] },
  edges: [],
});

test('a grid cell holding one item links straight to it', () => {
  const svg = renderBoard(gridBoard([{ day: '2026-09-06', state: 'ran', count: 1, numbers: [11] }]), { repo: REPO });
  assert.ok(svg.all('a').some((a) => a.attrs.href === `https://github.com/${REPO}/issues/11`));
});

test('a grid cell holding several opens the search that names exactly those', () => {
  const svg = renderBoard(gridBoard([{ day: '2026-09-06', state: 'ran', count: 2, numbers: [11, 12] }]), { repo: REPO });
  const href = svg.all('a').map((a) => a.attrs.href).find((h) => h?.includes('?q='));
  assert.ok(href, 'the cell is a link');
  assert.match(href, /11\+12|11%2012|11\+12/);
  // Never state:open — a cell of closed occurrences would match nothing.
  assert.doesNotMatch(href, /state%3Aopen|state:open/);
});

test('a predicted cell has nothing to open, so it is not a link', () => {
  const svg = renderBoard(gridBoard([{ day: '2026-09-06', state: 'predicted', count: 0 }]), { repo: REPO });
  assert.equal(svg.all('a').length, 0);
});

// The hover replaces the block that used to sit under the board, so it has to carry
// what that block did — and what it carries differs by what the mark is.
test('hovering a mark fills the tip, and leaving it empties it', () => {
  const tip = new FakeEl('div');
  const svg = renderBoard(board([prRow]), {
    repo: REPO, tip, tipFor: (subject) => [`tip for ${subject.gutter}`],
  });
  const mark = svg.all('rect').find((r) => r.on?.mouseenter);
  assert.ok(mark, 'a mark listens for the pointer');
  mark.fire('mouseenter', { clientX: 10, clientY: 10 });
  assert.match(tip.text, /tip for/);
  assert.equal(tip.hidden, false);
  mark.fire('mouseleave');
  assert.equal(tip.hidden, true);
});

// With nothing to fill, the board draws exactly as it did — the hover is an addition,
// never a thing the board needs to render.
test('a board given no tip still draws', () => {
  assert.ok(renderBoard(board([prRow]), { repo: REPO }).all('rect').length);
});
