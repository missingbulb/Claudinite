import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// A DOM the size of what these renderers actually use. The repo carries no
// dependencies and this is a few lines — a browser engine to assert that a span got a
// class would be a poor trade, and the real page is what proves the CSS.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.textContent = ''; this.className = ''; }
  append(...kids) { for (const k of kids) this.children.push(k); }
  replaceChildren(...kids) { this.children = kids; }
  get classList() { return { add: (c) => { this.className = `${this.className} ${c}`.trim(); } }; }
  // Everything this subtree renders, flattened — text nodes are appended as strings.
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

let miniCard, miniAbsent, packCard, parseDescriptor, fleetPhrase;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  ({ miniCard, miniAbsent, packCard } = await import('./contrib-view.mjs'));
  ({ parseDescriptor, fleetPhrase } = await import('./contributions.mjs'));
});

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const descriptor = (over = {}) => parseDescriptor(JSON.stringify({
  widgets: [
    { id: 'stars', kind: 'stat', label: 'stars', noun: 'stars', glyph: '★', source: 'repo-stars' },
    { id: 'landed', kind: 'window', label: 'requirements changed', noun: 'reqs' },
    { id: 'recent', kind: 'list', label: 'recently changed' },
  ],
  repo: ['stars', 'landed', 'recent'],
  ...over,
}), 'demo');

// THE THREE REGISTERS, as separate elements. This is the whole payoff of a pack
// supplying parts rather than a finished string: a string could not be set this way.
test('a mini-card sets the quantity, noun and connective as their own spans', () => {
  const w = descriptor().widgets.get('landed');
  const card = miniCard(fleetPhrase(w, { value: 31, window: '1w' }, NOW), { title: 't' });
  assert.deepEqual(card.find('q').map((n) => n.textContent), ['31', '1w']);
  assert.deepEqual(card.find('n').map((n) => n.textContent), ['reqs']);
  assert.deepEqual(card.find('c').map((n) => n.textContent), ['in last']);
  // The words still read in order, with the spacing between them.
  assert.equal(card.text.replace(/\s+/g, ' ').trim(), '31 reqs in last 1w');
});

test('a glyph rides ahead of the phrase, and the phrase reads without it', () => {
  const w = descriptor().widgets.get('stars');
  const card = miniCard(fleetPhrase(w, { value: 18 }, NOW), { title: 't', glyph: w.glyph });
  assert.deepEqual(card.find('mini-glyph').map((n) => n.textContent), ['★']);
  assert.equal(card.find('mini-glyph')[0]['aria-hidden'], 'true');
  const bare = miniCard(fleetPhrase(w, { value: 18 }, NOW), { title: 't' });
  assert.equal(bare.text.replace(/\s+/g, ' ').trim(), '18 stars');
});

// MONOCHROME: a contribution never colours itself, so there is nothing on a mini-card
// for a pack to paint. Colour on that grid is the engine's severity edge.
test('a mini-card carries no colour of its own', () => {
  const w = descriptor().widgets.get('landed');
  const card = miniCard(fleetPhrase(w, { value: 900, window: '1w' }, NOW), { title: 't' });
  const styled = [card, ...card.find('q'), ...card.find('n')].filter((n) => n.style);
  assert.deepEqual(styled, []);
});

test('a card that cannot make a line says which state it is in', () => {
  assert.equal(miniAbsent('not read', 'p').text, 'not read');
  assert.equal(miniAbsent('not read', 'p').className, 'mini none');
});

// A descriptor the page cannot use becomes ONE named line — never a missing card, so a
// broken pack is visibly broken rather than invisibly absent.
test('a faulted descriptor renders a card that names the fault', () => {
  const card = packCard({ pack: 'demo', descriptor: { fault: 'its dashboard.json is not valid JSON' } }, NOW);
  assert.match(card.text, /demo/);
  assert.match(card.text, /not valid JSON/);
});

test('a withheld read renders as withheld, not as a pack with nothing to say', () => {
  const card = packCard({ pack: 'demo', withheld: true }, NOW);
  assert.match(card.text, /declined to spend/);
});

// Named once at the card and naming the FILE, because "what writes this" is the next
// question a reader has.
test('a pack whose values file does not exist names the file', () => {
  const card = packCard({ pack: 'demo', descriptor: descriptor(), values: null, live: { stars: 4 } }, NOW);
  assert.match(card.text, /\.claudinite\/local\/dashboard\/demo\.GENERATED\.json/);
  // …and the widget that did have a live source still renders its number.
  assert.match(card.text, /4/);
});

test('a deployment card renders the ids the deployment names, not the repo card\'s', () => {
  const d = descriptor({ fleet: { deployment: ['landed'] } });
  const card = packCard(
    { pack: 'demo', descriptor: d, values: { generatedAt: null, values: { landed: { value: 3, previous: 1, window: '30d' } } }, from: 'o/canon' },
    NOW, { ids: d.deployment },
  );
  assert.match(card.text, /3/);
  assert.ok(!card.text.includes('stars'), card.text);
  assert.match(card.text, /canon/);
});

// The previous window is spelled out rather than left as a bare arrow: a change with
// nothing to compare against is the vanity total this surface refuses.
test('a repo window widget shows its previous window in words', () => {
  const card = packCard({
    pack: 'demo', descriptor: descriptor({ repo: ['landed'] }),
    values: { generatedAt: null, values: { landed: { value: 12, previous: 7, window: '2w' } } },
  }, NOW);
  assert.match(card.text, /▲ 7/);
});
