import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// `groupedHead` draws the header of every grouped table on both views, and until #1797
// nothing here touched it. What that cost: the row went out wearing `band`, the ledger
// sheet's own component name, so it was laid out as that component's two-column grid —
// `colSpan` ignored, the group titles stacked two-up on top of each other on every one
// of those tables — and the whole suite stayed green.
//
// So the two properties the fault violated are pinned, and the second is asserted as a
// COLLISION rather than as today's spelling: a test reading `className === 'group-band'`
// would pin a point in time and pass just as happily on the next name the sheet also
// styles.

class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  appendChild(k) { this.children.push(k); return k; }
  all(tag) {
    const hit = this.tagName === tag ? [this] : [];
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.all(tag));
    return hit;
  }
}

let groupedHead;
let columnCount;
let band;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag), createElementNS: (_ns, tag) => new FakeEl(tag) };
  ({ groupedHead, columnCount } = await import('../ui.mjs'));
  ({ band } = await import('../sheet.mjs'));
});

// The fleet members grid's own shape: an unlabelled identity column, a one-column group
// whose title is wider than it, and two wide ones.
const GROUPS = [
  ['', ['Member']],
  ['Activity', ['Commits']],
  ['Waiting on a person', ['Est.', 'What it is', 'Issues', 'Pull requests']],
  ['Claudinite', ['Packs', 'Queue', 'Recent outcomes', 'Scheduler']],
];

const head = (groups) => {
  const table = new FakeEl('table');
  groupedHead(table, groups);
  const thead = table.children.find((c) => c.tagName === 'thead');
  return { band: thead.children[0], names: thead.children[1] };
};

test('each group gets one cell, spanning exactly its own columns', () => {
  const { band: row, names } = head(GROUPS);
  assert.deepEqual(row.children.map((th) => th.colSpan), [1, 1, 4, 4]);
  assert.deepEqual(row.children.map((th) => th.textContent),
    ['', 'Activity', 'Waiting on a person', 'Claudinite']);
  // The band and the names below it cover the same grid — a band that sums to fewer
  // columns than the table has is a row the layout is free to reflow.
  assert.equal(row.children.reduce((n, th) => n + th.colSpan, 0), columnCount(GROUPS));
  assert.equal(names.children.length, columnCount(GROUPS));
});

// The drift guard, run against BOTH real functions rather than against either one's
// spelling: whatever the two are called, they must not be called the same thing.
test('the grouped head wears no class the sheet band styles', () => {
  const classesOf = (node) => new Set(String(node.className).split(' ').filter(Boolean));
  const sheetBand = classesOf(band('A label', 'a question?', []));
  const shared = [...classesOf(head(GROUPS).band)].filter((c) => sheetBand.has(c));
  assert.deepEqual(shared, [],
    `the grouped head's row and sheet.mjs's band share ${shared.join(', ')} — the sheet styles `
    + 'that class as a grid, which drops the head\'s colSpan and stacks its titles');
});

test('a single-group head still spans its columns', () => {
  const { band: row } = head([['Findings', ['Blocking', 'Advisory']]]);
  assert.deepEqual(row.children.map((th) => th.colSpan), [2]);
});
