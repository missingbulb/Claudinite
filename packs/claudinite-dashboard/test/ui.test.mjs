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
let refNodes;
let reasonNodes;
let queueUrl;
let attentionMark;

before(async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  ({ leadCard, refNodes, reasonNodes, queueUrl, attentionMark } = await import('../ui.mjs'));
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
  park: { blocking: true, triage: null },
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

test('what it costs a person is on the card, in its own slot', () => {
  const card = leadCard(candidate(), { minutes: 15 });
  assert.equal(card.find('lead-est')[0].text, '15 minof your time');
});

test('a figure the caller had to disclaim says so on the card', () => {
  const card = leadCard(candidate(), { minutes: 1, note: 'PR size unread, so a lower bound' });
  assert.match(card.find('lead-est')[0].text, /at least/);
});

test('work nothing measures shows no figure rather than a zero', () => {
  const est = leadCard(candidate()).find('lead-est')[0];
  assert.match(est.className, /none/);
  assert.match(est.text, /no time estimate/);
  assert.doesNotMatch(est.text, /\b0\b/);
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

// --- the linkifier -----------------------------------------------------------------

test('every #N in a sentence comes back as an anchor, and the prose between them survives', () => {
  const nodes = refNodes('an-owner/TicketWatch', 'blocked by #12, #13');
  assert.deepEqual(nodes.filter((n) => typeof n === 'string'), ['blocked by ', ', ']);
  const links = nodes.filter((n) => typeof n !== 'string');
  assert.deepEqual(links.map((a) => a.textContent), ['#12', '#13']);
  assert.deepEqual(links.map((a) => a.href), [
    'https://github.com/an-owner/TicketWatch/issues/12',
    'https://github.com/an-owner/TicketWatch/issues/13',
  ]);
});

test('a pull request number takes the same URL as an issue — GitHub redirects it', () => {
  const [link] = refNodes('an-owner/TicketWatch', '#42 lands when you merge PR #43');
  assert.equal(link.href, 'https://github.com/an-owner/TicketWatch/issues/42');
  const pr = refNodes('an-owner/TicketWatch', 'PR #43').at(-1);
  assert.equal(pr.href, 'https://github.com/an-owner/TicketWatch/issues/43');
});

test('text naming no number comes back as itself, so a caller can hand anything to it', () => {
  assert.deepEqual(refNodes('an-owner/TicketWatch', 'not read'), ['not read']);
});

test('a warning that names the items holding a task links each of them', () => {
  const [span] = reasonNodes([{ level: 'warning', text: 'blocked on #12, #13 for over 2 days' }], 'an-owner/TicketWatch');
  assert.equal(span.className, 'warn warning');
  assert.match(span.text, /▲ blocked on #12, #13 for over 2 days/);
  const links = span.children.filter((c) => typeof c !== 'string');
  assert.deepEqual(links.map((a) => a.href), [
    'https://github.com/an-owner/TicketWatch/issues/12',
    'https://github.com/an-owner/TicketWatch/issues/13',
  ]);
});

test('the fleet page passes no repo, and a number stays text rather than a link to nowhere', () => {
  const [span] = reasonNodes([{ level: 'critical', text: '2 items parked broken, #12 the worst' }]);
  assert.match(span.text, /2 items parked broken, #12 the worst/);
  assert.equal(span.children.filter((c) => typeof c !== 'string').length, 0);
});

// --- the queue as one URL ------------------------------------------------------------

test('a queue inside one repo is that repo\'s open issues, narrowed to its numbers', () => {
  const url = queueUrl([
    { repo: 'an-owner/TicketWatch', number: 401 },
    { repo: 'an-owner/TicketWatch', number: 275 },
  ]);
  assert.equal(url, 'https://github.com/an-owner/TicketWatch/issues?q=is%3Aissue+state%3Aopen+401+275');
});

test('a queue spanning members is one cross-repository search, naming every member', () => {
  const url = queueUrl([
    { repo: 'an-owner/TicketWatch', number: 401 },
    { repo: 'an-owner/Shepherd', number: 12 },
  ]);
  assert.match(url, /^https:\/\/github\.com\/search\?type=issues&q=/);
  assert.match(decodeURIComponent(url), /repo:an-owner\/TicketWatch\+repo:an-owner\/Shepherd/);
  assert.match(decodeURIComponent(url), /401\+12/);
});

test('a candidate with no number of its own is not in the search, and a queue of none has no URL', () => {
  assert.equal(queueUrl([{ repo: 'an-owner/TicketWatch', number: null }]), null);
  assert.equal(queueUrl([]), null);
  assert.match(queueUrl([{ repo: 'a/b', number: null }, { repo: 'a/b', number: 7 }]), /issues\?q=is%3Aissue\+state%3Aopen\+7$/);
});

// --- the attention mark -----------------------------------------------------------

// The grid's Waiting cell. Prose here cost the whole table its shape, so the sentences
// move to the hover and the cell keeps a bar and one line.
const needs = [
  { kind: 'broken', level: 'critical', count: 2, short: 'broken', text: '2 tasks broken' },
  { kind: 'decisions', level: 'serious', count: 4, short: 'decisions', text: '4 items needing a decision' },
  { kind: 'actions', level: 'serious', count: 9, short: 'actions', text: '9 items needing something changed outside the code' },
  { kind: 'approvals', level: 'warning', count: 1, short: 'approval', text: '1 item needing approval' },
];

test('the mark says how much of what on one line, not in a paragraph', () => {
  const mark = attentionMark(needs);
  assert.equal(mark.find('sub')[0].textContent, '2 broken · 4 decisions · 9 actions · 1 approval');
});

// A bar segment per LEVEL, not per kind: two serious kinds drawn as two adjacent
// segments of the same colour is a boundary that means nothing. The line below names
// the kinds, which is where that distinction actually survives.
test('the bar weighs the levels, worst first, and merges the kinds inside one', () => {
  const bars = attentionMark(needs).find('bar');
  assert.equal(bars.length, 1);
  assert.deepEqual(bars[0].children.map((i) => i.title), ['2 critical', '13 serious', '1 warning']);
});

// The sentences are not deleted, only moved. Losing them would leave the reader with
// "9 actions" and nowhere to find out what an action is.
test('the full sentences are on the mark itself, so nothing is lost to the fold', () => {
  assert.equal(
    attentionMark(needs).title,
    '2 tasks broken\n4 items needing a decision\n9 items needing something changed outside the code\n1 item needing approval',
  );
});

test('a member with nothing waiting says so, and draws no bar', () => {
  const mark = attentionMark([]);
  assert.equal(mark.find('bar').length, 0);
  assert.match(mark.text, /nothing waiting/);
});
