import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The Work section's three table views, rendered. A view is a header list, a filter and
// a row of cells, and nothing here checks what they say — that is `work.test.mjs`'s job.
// What it checks is that the view renders AT ALL: the redesign that put the board in
// front of the tables deleted the header lists and kept both references to them, so
// every non-board view threw a ReferenceError on click and the section went blank. Only
// the board tab, which returns before the table is painted, survived.

// The same few lines of DOM the other view tests use.
class FakeEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.textContent = ''; this.className = '';
    this.dataset = {}; this.style = {}; this.hidden = false;
  }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  appendChild(k) { this.children.push(k); return k; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  setAttribute(k, v) { this[k] = v; }
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

let renderWork;
let nodes;

before(async () => {
  nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, new FakeEl('div'));
    return nodes.get(id);
  };
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    createElementNS: (_ns, tag) => new FakeEl(tag),
    getElementById: get,
    querySelectorAll: () => [],
  };
  ({ renderWork } = await import('../view-repo.mjs'));
});

const NOW = Date.parse('2026-08-21T11:30:00Z');
const REPO = 'an-owner/TicketWatch';

// One row per view, so no view falls back to its empty state and skips the cells.
const row = (view, over = {}) => ({
  key: `a-pack/${view}`,
  task: `a-pack/${view}`,
  pack: 'a-pack',
  view,
  level: 'ok',
  troubles: [],
  history: [],
  declaration: { agent_model: 'a-model', expected_outcome: 'fresh_pr' },
  frequency: 'daily',
  current: null,
  lastClosed: null,
  ...over,
});

const ALL = [row('stuck'), row('pending'), row('all')];

for (const view of ['stuck', 'pending', 'all']) {
  test(`the ${view} view renders its header and its rows`, () => {
    renderWork(ALL, REPO, NOW, view);
    const table = nodes.get('work');
    const head = table.children.find((c) => c.tagName === 'thead');
    assert.ok(head, 'the view drew a header');
    const names = head.children[0].children.map((th) => th.textContent);
    assert.ok(names.length >= 5, `${view} names its columns: ${names.join(', ')}`);
    assert.equal(names[0], 'Task');
    // Every row's cells fill the header exactly — a view whose two halves disagree
    // draws a ragged table nobody notices until a column is silently dropped.
    const body = table.children.find((c) => c.tagName === 'tbody');
    for (const tr of body.children) assert.equal(tr.children.length, names.length);
  });
}

// The board tab returns before the table is painted, which is why it went on working
// while the other three threw. It stays a tab like the rest.
test('the switcher offers the three table views even with no board', () => {
  renderWork(ALL, REPO, NOW, 'all');
  const labels = nodes.get('work-views').children.map((b) => b.textContent);
  assert.deepEqual(labels, ['stuck · 1', 'pending · 1', 'all · 3']);
});
