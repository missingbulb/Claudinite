import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The machinery panel, RENDERED — on both pages, from a fixture of the file it reads.
// The derivation has its own suite; what this one asks is whether the panel draws at
// all and whether the three rules it renders under survive the trip to the DOM: a
// window stated against the window before it, an unrecorded counter that says so
// instead of drawing a zero, and a member folding nothing named rather than averaged in.

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
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text))].join(' ');
  }
  find(cls) {
    const hit = [];
    if (this.className.split(' ').includes(cls)) hit.push(this);
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.find(cls));
    return hit;
  }
}

let decodeTasksUsage; let tasksMachine; let fleetTasksMachine; let machinePanel; let fleetMachinePanel;
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
  ({ decodeTasksUsage } = await import('../src/read/usage.mjs'));
  ({ tasksMachine, fleetTasksMachine } = await import('../src/derive/tasks-machine.mjs'));
  ({ machinePanel, fleetMachinePanel } = await import('../src/render/machine-view.mjs'));
});

const NOW = Date.parse('2026-09-15T12:00:00Z');

const FIELDS = {
  day: ['runs', 'jobs', 'minutesBilled', 'spend', 'apiCalls'],
  workflows: ['runs', 'jobs', 'minutesBilled', 'spend'],
  queue: ['done', 'delivered', 'obsolete', 'none'],
  parks: ['failure', 'action', 'decision', 'approval'],
  latency: ['tickToItemMinutes', 'itemToPickMinutes', 'pickToHandOffMinutes', 'handOffToConvergeMinutes'],
};

// One folded day in each window, so both sides of every comparison have something to
// say and the days between them are genuinely absent from the file.
const DAYS = {
  '2026-09-04': {
    totals: [4, 8, 12, null, null],
    workflows: { executor: [3, 6, 9, null], scheduler: [1, 2, 3, null] },
    queue: { 'a-pack/alpha': [2, null, null, null] },
    parks: { 'a-pack/alpha': [1, null, null, null] },
    latency: { 101: [null, 10, 4, 100] },
  },
  '2026-09-11': {
    totals: [10, 20, 30, null, 62],
    workflows: { executor: [8, 16, 24, null], scheduler: [2, 4, 6, null] },
    queue: { 'a-pack/alpha': [5, 1, null, null] },
    parks: { 'a-pack/alpha': [null, 2, null, 1] },
    latency: { 201: [null, 30, 8, 300], 202: [null, 40, 10, 400] },
  },
};

const file = (over = {}) => decodeTasksUsage({
  version: 1, generated: '2026-09-15T13:18:16.932Z', foldedThrough: '2026-09-15',
  minuteRate: null, fields: FIELDS, days: DAYS, hours: {}, weeks: {}, ...over,
});

// The panel's whole rendered text, which is what a person actually reads off it.
const render = (nodesOut) => {
  const wrap = new FakeEl('div');
  wrap.replaceChildren(...nodesOut);
  return wrap.text;
};

test('the repo panel draws reliability, cost and the window it compares against', () => {
  const text = render(machinePanel(tasksMachine(file(), { now: NOW, span: 7 })));

  assert.match(text, /reliability/);
  assert.match(text, /cost/);
  // The window is STATED, both ends, and so is the one it is read against — a delta
  // with nothing named to compare it to is the vanity figure this panel avoids.
  assert.match(text, /2026-09-09 → 2026-09-15/);
  assert.match(text, /2026-09-02 → 2026-09-08/);
  assert.match(text, /1\/7 day\(s\) folded this window/);

  // The figures themselves, and the previous window spelled out beside the arrow.
  assert.match(text, /work items closed/);
  assert.match(text, /vs the week before/);
  assert.match(text, /workflow runs/);
  assert.match(text, /billed minutes/);
});

test('an unrecorded counter says so on the tile rather than drawing a zero', () => {
  const text = render(machinePanel(tasksMachine(file(), { now: NOW, span: 7 })));
  // This member declares no rate, so the file carries no `spend` — and the tile names
  // the key that would price it rather than reading as a repo that spent nothing.
  assert.match(text, /not recorded — no actionsMinuteRate/);
  assert.doesNotMatch(text, /\$0\.00/);
});

test('the panel names what the file does not carry', () => {
  const text = render(machinePanel(tasksMachine(file(), { now: NOW, span: 7 })));
  assert.match(text, /what this panel cannot show/);
  assert.match(text, /janitor repairs/);
  assert.match(text, /leash reclaims/);
  // And it says how current the numbers are, which is not the same as when the file landed.
  assert.match(text, /Folded through 2026-09-15/);
});

test('latency is drawn as quantiles over the window\'s samples, withheld below two', () => {
  const text = render(machinePanel(tasksMachine(file(), { now: NOW, span: 7 })));
  assert.match(text, /how long each leg took/);
  assert.match(text, /item → pick/);
  assert.match(text, /hand-off → converge/);
  // Two item→pick samples this window (30m, 40m): p50 is the lower, and the leg whose
  // far end never happened contributes no sample at all.
  assert.match(text, /30m/);
  assert.match(text, /A leg whose far end never happened/);
});

test('a repo that folds no machinery file says which file and which task writes it', () => {
  const text = render(machinePanel(tasksMachine(null, { now: NOW, span: 7 })));
  assert.match(text, /folds no machinery usage file/);
  assert.match(text, /task-runs-and-costs\.json/);
  assert.match(text, /tasks-usage-fold/);
  // It does not borrow the sessions' file to fill the gap.
  assert.doesNotMatch(text, /acme-task-g task writes[^]*sessions/);
});

test('the fleet roll-up names the members folding nothing and counts them in nothing', () => {
  const reads = [
    { repo: 'o/One', declaration: { packs: [] }, tasksUsage: file() },
    { repo: 'o/Two', declaration: { packs: [] }, tasksUsage: file() },
    { repo: 'o/Quiet', declaration: { packs: [] }, tasksUsage: null },
  ];
  const text = render(fleetMachinePanel(fleetTasksMachine(reads, { now: NOW, span: 7 })));

  assert.match(text, /2\/3 member\(s\) fold this file/);
  assert.match(text, /not folding: Quiet/);
  assert.match(text, /folds no machinery usage file/, 'the absent member is a named row, not a row of zeroes');
  assert.match(text, /counted in no figure above/);
  // 10 runs each from the two folding members; the third adds nothing, not even a zero.
  assert.match(text, /\b20\b/);
});

test('an all-absent fleet renders the waiting state rather than an empty chart', () => {
  const reads = [{ repo: 'o/Quiet', declaration: { packs: [] }, tasksUsage: null }];
  const text = render(fleetMachinePanel(fleetTasksMachine(reads, { now: NOW, span: 7 })));
  assert.match(text, /no member folds a machinery usage file yet/);
  assert.match(text, /1 readable member\(s\)/);
});

test('every chart the panel draws carries a legend', () => {
  // Identity is never colour-alone: two or more series always ship a legend beside them.
  const wrap = new FakeEl('div');
  wrap.replaceChildren(...machinePanel(tasksMachine(file(), { now: NOW, span: 7 })));
  const charts = wrap.find('chart-wrap');
  const legends = wrap.find('legend');
  assert.ok(charts.length >= 2, `expected the outcome and run charts, found ${charts.length}`);
  assert.equal(legends.length, charts.length, 'one legend per chart');
});
