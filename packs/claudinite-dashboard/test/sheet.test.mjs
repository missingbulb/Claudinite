import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// The same few lines of DOM the other view tests use — enough for what a renderer
// touches, and no browser engine to assert that a div got a class.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; this.attrs = {}; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  get text() {
    return [this.textContent, ...this.children.map((c) => (typeof c === 'string' ? c : c.text))].join(' ');
  }
  find(cls) {
    const hit = this.className.split(' ').includes(cls) ? [this] : [];
    for (const c of this.children) if (c instanceof FakeEl) hit.push(...c.find(cls));
    return hit;
  }
}

let sheet;
before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    createElementNS: (ns, tag) => new FakeEl(tag),
  };
  sheet = await import('../sheet.mjs');
});

const fig = (over = {}) => ({
  value: 47, previous: 61, delta: -14, unit: 'merged PRs', sub: '38 with nobody in the loop',
  spark: null, bad: false, gap: null, ...over,
});

test('a figure row lays out the four tracks the ledger aligns on', () => {
  const row = sheet.figureRow(fig());
  assert.equal(row.className, 'fig');
  assert.equal(row.find('v')[0].textContent, '47');
  assert.match(row.find('t')[0].text, /merged PRs/);
  assert.match(row.find('d')[0].text, /−14/);
  assert.match(row.find('d')[0].text, /vs 61/, 'the base stays under the delta rather than on hover');
});

test('a gap REPLACES the sub-line and takes the muted step, on one line', () => {
  // Appending the sentence to the unit is what made the row three lines tall and the
  // ledger's tracks stop lining up; a figure with no number also has nothing for a
  // second actionable figure to sit beside.
  const row = sheet.figureRow(fig({ value: null, gap: 'not recorded — this fold predates humanSeconds' }));
  assert.equal(row.find('v')[0].className, 'v gap');
  assert.equal(row.find('v')[0].textContent, '—');
  const lines = row.find('s');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].className, 's gap');
  assert.match(lines[0].textContent, /predates humanSeconds/);
  assert.doesNotMatch(row.find('u')[0].text, /predates/, 'the unit stays the unit');
});

test('a delta is INK unless the figure\'s own bad-when fired', () => {
  assert.equal(sheet.deltaCell(fig({ delta: -14 })).className, 'd');
  assert.equal(sheet.deltaCell(fig({ delta: 3, bad: true })).className, 'd bad');
  // Nothing green is coloured — nothing green needs a person — so there is no good class.
  assert.equal(sheet.deltaCell(fig({ delta: 9 })).className, 'd');
  assert.equal(sheet.deltaCell(fig({ delta: null })).className, 'd gap');
});

test('a delta carries a real minus and a signed zero, in that order', () => {
  assert.match(sheet.deltaCell(fig({ delta: -14 })).text, /−14/);
  assert.match(sheet.deltaCell(fig({ delta: 14 })).text, /\+14/);
  assert.match(sheet.deltaCell(fig({ delta: 0 })).text, /±0/);
});

test('a band is a stub and a body — never a card', () => {
  const b = sheet.band('This week', 'against last', 'the body');
  assert.equal(b.className, 'band');
  assert.match(b.find('stub')[0].text, /This week/);
  assert.match(b.find('stub')[0].text, /against last/);
  assert.match(b.find('body')[0].text, /the body/);
});

test('the machine cell shows a dash and no unit noise where the figure is unknown', () => {
  const cell = sheet.machineCell({ level: 'none', label: 'Next wake', value: null, unit: 'not read', note: 'no roster' });
  assert.equal(cell.find('v')[0].children[0].className, 'gap');
  assert.match(cell.find('n')[0].textContent, /no roster/);
  assert.equal(cell.find('sq')[0].className, 'sq none');
});

test('a sparkline draws nothing at all for a day nobody folded', () => {
  const svg = sheet.sparkline([
    { day: '2026-08-27', value: 3 }, { day: '2026-08-28', value: null }, { day: '2026-08-29', value: 5 },
  ]);
  // Two bars, not three: a blank is not a floor, and a zero-height bar reads as one.
  assert.equal(svg.children.filter((c) => c.tagName === 'rect').length, 2);
});

test('the pulse marks today as an outline and skips an unfolded day', () => {
  const svg = sheet.pulseChart({
    peak: 6,
    days: [
      { day: '2026-08-30', sessions: 6, members: ['o/a'], series: 'previous' },
      { day: '2026-08-31', sessions: null, members: [], series: 'current' },
      { day: '2026-09-01', sessions: 2, members: ['o/a'], series: 'current' },
      { day: '2026-09-02', sessions: 0, members: [], series: 'today' },
    ],
  });
  const rects = svg.children.filter((c) => c.tagName === 'rect');
  assert.equal(rects.length, 3, 'the day nobody folded is a blank');
  assert.equal(rects[0].attrs.fill, 'var(--dim)', 'last week is the dimmed series');
  assert.equal(rects[1].attrs.fill, 'var(--machine)');
  assert.equal(rects[2].attrs.fill, 'none', 'today is an outline — it is not folded yet');
  assert.equal(rects[2].attrs['stroke-dasharray'], '3 3');
});

test('the expand discloses a ruled table and says which way it is pointing', () => {
  const target = new FakeEl('div');
  target.hidden = true;
  const button = sheet.expander('per member', target);
  assert.equal(button.textContent, 'per member ▾');
  assert.equal(button.attrs['aria-expanded'], 'false');
});

test('a detail row can span the table to say a member is counted in nothing above', () => {
  const table = sheet.detailTable(
    [{ label: 'Member' }, { label: 'Sessions', num: true }],
    [['Claudinite', 12], [{ text: 'lab, notes', gap: true }, { text: 'no fold', gap: true, colSpan: 1 }]],
  );
  const body = table.children[1];
  assert.equal(body.children[1].children[0].className, 'gap');
  assert.equal(body.children[0].children[1].className, 'num');
});

test('a sub-line naming an item links it, on the page of the repo it belongs to', () => {
  const row = sheet.figureRow(fig({ sub: '3 for you · #88 · 1 on the machine' }), { repo: 'an-owner/TicketWatch' });
  const link = row.find('s')[0].children.find((c) => typeof c !== 'string' && c.tagName === 'a');
  assert.equal(link.href, 'https://github.com/an-owner/TicketWatch/issues/88');
  // The fake DOM joins children with a space, so the prose is asserted piece by piece.
  assert.match(row.find('s')[0].text, /3 for you .+#88.+1 on the machine/);
});

// --- the slip's queue ----------------------------------------------------------------

test('the queue behind the slip is steppable, and says how deep the reader is', () => {
  const steps = [];
  const node = sheet.slip({
    headline: 'parked for a human', where: '#275', href: 'x',
    queue: { index: 0, total: 4, onStep: (i) => steps.push(i) },
  });
  const [back, forward] = node.find('step');
  assert.equal(back.disabled, true, 'the first candidate has nothing before it');
  assert.match(node.find('at')[0].text, /1 \/ 4/);
  forward.onclick();
  assert.deepEqual(steps, [1], 'a step names the candidate it wants, and the page repaints');

  const third = sheet.slip({ headline: 'x', queue: { index: 2, total: 4, onStep: (i) => steps.push(i) } });
  third.find('step')[0].onclick();
  assert.deepEqual(steps, [1, 1], 'and stepping back names the one before it');
});

test('the last candidate cannot step forward, and the first cannot step back', () => {
  const last = sheet.slip({ headline: 'x', queue: { index: 3, total: 4, onStep: () => {} } });
  const [back, forward] = last.find('step');
  assert.equal(back.disabled, false);
  assert.equal(forward.disabled, true);
});

test('one candidate is not a queue, and gets no stepper', () => {
  assert.equal(sheet.slip({ headline: 'x', queue: { index: 0, total: 1, onStep: () => {} } }).find('step').length, 0);
});

test('see all opens the whole queue as one GitHub search', () => {
  const node = sheet.slip({ headline: 'x', queue: { index: 0, total: 2, onStep: () => {} }, seeAll: 'https://github.com/q' });
  const link = node.find('see-all')[0];
  assert.equal(link.href, 'https://github.com/q');
  assert.match(link.text, /see all/i);
});
