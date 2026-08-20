// Shared rendering vocabulary. Both views draw from this so a state, a duration or a
// severity looks and reads the same whether you are looking at one repo or twelve —
// a fleet page whose "blocked" chip differs from the repo page's is a page you have
// to learn twice.

import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
} from '../../engine/scheduler/queue/work-item.mjs';

export const $ = (id) => document.getElementById(id);

export const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) if (k !== null && k !== undefined && k !== '') n.append(k);
  return n;
};

// --- formatting ---------------------------------------------------------------

const DUR = [['d', 86400e3], ['h', 3600e3], ['m', 60e3]];

export function duration(msVal) {
  if (msVal == null || !Number.isFinite(msVal)) return '—';
  const v = Math.abs(msVal);
  for (const [suffix, unit] of DUR) if (v >= unit) return `${Math.floor(v / unit)}${suffix}`;
  return '<1m';
}

export const ago = (at, now) => {
  const t = at == null ? null : (typeof at === 'number' ? at : new Date(at).getTime());
  return t ? `${duration(now - t)} ago` : '—';
};
export const until = (date, now) => (date ? `in ${duration(date.getTime() - now)}` : '—');
export const stamp = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) : '—');

// --- state and severity ---------------------------------------------------------

export const STATE_UI = {
  [BLOCKED]:     { cls: 'blocked',   label: 'blocked' },
  [READY]:       { cls: 'ready',     label: 'ready' },
  [EXECUTING]:   { cls: 'executing', label: 'executing' },
  [AGENT]:       { cls: 'agent',     label: 'agent' },
  [NEEDS_HUMAN]: { cls: 'human',     label: 'needs human' },
  torn:          { cls: 'torn',      label: 'torn labels' },
  unlabelled:    { cls: 'torn',      label: 'no state label' },
  closed:        { cls: 'idle',      label: 'closed' },
};

// The order the queue's states are shown in everywhere: the sequence an item moves
// through, so a row reads left to right as progress.
export const STATE_ORDER = [BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN];

// Keyed by the canonical outcome words `outcomeOf` decodes to, so a spelling
// migration in the labels never reaches this table.
export const OUTCOME_COLOR = {
  done: 'var(--good)',
  delivered: 'var(--s-violet)',
  obsolete: 'var(--muted)',
  none: 'var(--critical)',
};

export const STATE_COLOR = {
  [BLOCKED]: 'var(--s-blue)',
  [READY]: 'var(--s-aqua)',
  [EXECUTING]: 'var(--s-yellow)',
  [AGENT]: 'var(--s-violet)',
  [NEEDS_HUMAN]: 'var(--critical)',
};

// Severity always ships as colour PLUS a glyph and words — the status palette is
// reserved and never carries meaning on its own.
export const LEVEL_GLYPH = { critical: '●', serious: '▲', warning: '▲', info: '·', ok: '✓' };

export function chip(state) {
  const ui = STATE_UI[state] ?? { cls: 'idle', label: state ?? 'idle' };
  return el('span', { className: `chip ${ui.cls}` }, [el('i', { className: 'dot' }), ui.label]);
}

export const reasonNodes = (reasons) =>
  reasons.map((r) => el('span', {
    className: `warn ${r.level}`,
    textContent: `${LEVEL_GLYPH[r.level] ?? '▲'} ${r.text}`,
  }));

export const warnNodes = reasonNodes;

// --- marks ----------------------------------------------------------------------

// A thin proportional bar. Segments are `[label, count, color]`; zero-count segments
// are dropped rather than drawn as slivers.
export function segmentBar(segments, { width = 108, title = (l, n) => `${n} ${l}` } = {}) {
  const bar = el('div', { className: 'bar', style: `width:${width}px` });
  let any = false;
  for (const [label, count, color] of segments) {
    if (!count) continue;
    any = true;
    bar.append(el('i', { style: `flex:${count};background:${color}`, title: title(label, count) }));
  }
  if (!any) bar.append(el('i', { className: 'bar-empty', style: 'flex:1' }));
  return bar;
}

// --- the member row's compact marks ----------------------------------------------

// A fleet grid is thirteen columns wide, and three of them were spending a whole
// column each on something a glyph carries: a star count, a pass/fail word, and one
// relative date. These three fold that back — the row reads at the same glance and
// gives the width to the panels that need it.

// The star count, as the mark itself over the number. It rides ahead of the name
// rather than in the Status group because it is not a health signal: it says what
// KIND of repo this is, which is the frame you read the rest of the row in.
export const starMark = (stars) => el('div', {
  className: 'stars',
  title: stars == null ? 'stars unknown' : `${stars} stargazer${stars === 1 ? '' : 's'}`,
}, [
  el('div', { className: 'glyph', textContent: '★' }),
  el('div', { className: 'n num', textContent: stars == null ? '—' : String(stars) }),
]);

// CI as a dot with its age under it. The dot is never the whole message — it carries
// a `title` and an `aria-label` in words, because a colour alone is unreadable to a
// reader who cannot see the difference between this green and this red.
export function ciDot(ui, when) {
  return el('div', { className: 'ci-dot' }, [
    el('i', {
      className: `dot ${ui.cls}`,
      role: 'img',
      title: `CI ${ui.label}`,
      'aria-label': `CI ${ui.label}`,
    }),
    el('div', { className: 'sub', textContent: when }),
  ]);
}

// A member's last 90 days of commits, as GitHub draws them: a column per week, a row
// per weekday, shaded by how many commits landed that day.
//
// The scale is EACH ROW'S OWN peak, so a square's darkness compares days within one
// member and never across two. A fleet-wide scale was the alternative and it is
// worse: one member merging a vendored tree flattens every other row to blank, which
// is exactly the reading — "nothing happens in these repos" — that the graph exists
// to disprove. The peak is in the hover text so the scale is never guessed at.
//
// Three empty states, and they are three different facts. `null` days are outside the
// year of statistics the API returns; a null series is a read that did not happen
// (withheld for budget, or GitHub still computing); and zeroes are a repo that was
// genuinely quiet.
const COMMIT_LEVELS = 4;

export function commitGraph(series, { cell = 4, gap = 1, note = null } = {}) {
  if (!series) return el('div', { className: 'sub', textContent: 'not read' });

  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  const { days, peak, total, unread } = series;
  // Sunday-first columns, like GitHub's, so a reader who knows that grid reads this
  // one. The first column is short whenever the window opens mid-week.
  const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
  const columns = [];
  for (const d of days) {
    const w = weekday(d.day);
    if (!columns.length || w === 0) columns.push(new Array(7).fill(undefined));
    columns[columns.length - 1][w] = d;
  }

  const width = columns.length * (cell + gap) - gap;
  const height = 7 * (cell + gap) - gap;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`, width, height,
    class: 'commits', role: 'img',
    'aria-label': `${total} commits in the last ${days.length} days, busiest day ${peak}`,
  });

  columns.forEach((col, ci) => {
    col.forEach((d, wi) => {
      if (!d) return;
      // A day with no count is not a day with none: outside the data, it is drawn as
      // the empty square's own colour and says so on hover.
      const level = d.count == null || peak === 0 ? 0
        : (d.count === 0 ? 0 : Math.max(1, Math.ceil((d.count / peak) * COMMIT_LEVELS)));
      const rect = svgEl('rect', {
        x: ci * (cell + gap), y: wi * (cell + gap), width: cell, height: cell, rx: 1,
        class: `commit-cell l${level}${d.count == null ? ' unread' : ''}`,
      });
      const t = svgEl('title');
      t.textContent = d.count == null
        ? `${d.day} — outside the year of history GitHub reports`
        : `${d.day} — ${d.count} commit${d.count === 1 ? '' : 's'}`;
      rect.append(t);
      svg.append(rect);
    });
  });

  return el('div', { className: 'commit-graph' }, [
    svg,
    // One line under the grid, not two: this column's whole point is that it says
    // more than the date it replaced WITHOUT costing more width than the date did.
    el('div', {
      className: 'sub',
      textContent: [total === 0 && !unread ? 'none' : String(total), note].filter(Boolean).join(' · '),
    }),
  ]);
}

// --- tables ---------------------------------------------------------------------

export const head = (table, cols) => {
  table.replaceChildren();
  table.append(el('thead', {}, [el('tr', {}, cols.map((c) => el('th', { textContent: c })))]));
  return table.appendChild(el('tbody'));
};

export const emptyRow = (span, text) =>
  el('tr', {}, [el('td', { colSpan: span, className: 'empty', textContent: text })]);

export const issueLink = (repo, n) =>
  el('a', { href: `https://github.com/${repo}/issues/${n}`, target: '_blank', rel: 'noopener', textContent: `#${n}` });

export const repoLink = (repo) =>
  el('a', { href: `https://github.com/${repo}`, target: '_blank', rel: 'noopener', textContent: repo });

// --- counting up ----------------------------------------------------------------

// A fleet load repaints on EVERY member's read landing, so a headline number is
// rebuilt a dozen times in a couple of seconds and each rebuild replaces the digits
// outright. The eye reads that as flicker rather than as arrival: you cannot tell
// whether 7 became 9 or whether two different numbers were drawn.
//
// So a number that CHANGED tweens from what the reader was last shown to what it is
// now, and only that. A first paint has nothing to count from and simply appears; a
// value that did not move is not re-animated; anything non-numeric — `3/12`, `—` —
// has nothing to interpolate and is set outright.
//
// `key` is the identity across paints, because the node is not: `replaceChildren`
// discards the element the last tween was writing into. It is the tile's own label,
// which is what makes two tiles two counters.
const displayed = new Map();
const inFlight = new Map();

const COUNT_MS = 400;

// Motion here is decoration on a page whose job is fault-finding, so a reader who has
// asked the platform for less of it gets the number and none of the movement.
const stillness = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Decelerating, so the counter reads as landing on its value rather than as stopping
// mid-climb.
const ease = (t) => 1 - (1 - t) ** 3;

export function countUp(node, key, value) {
  const stop = inFlight.get(key);
  if (stop) { stop(); inFlight.delete(key); }

  const to = Number(value);
  const from = displayed.get(key);
  const set = (n) => { node.textContent = String(n); };

  if (!Number.isFinite(to) || typeof requestAnimationFrame !== 'function' || stillness()) {
    set(value);
    displayed.set(key, Number.isFinite(to) ? to : null);
    return node;
  }
  if (!Number.isFinite(from) || from === to) {
    set(to);
    displayed.set(key, to);
    return node;
  }

  const t0 = performance.now();
  let frame = 0;
  const step = (t) => {
    // Clamped at BOTH ends. A rAF callback is handed the timestamp of the frame it
    // belongs to, which can predate the `performance.now()` taken while scheduling it
    // — and a fractionally negative progress run through an ease that overshoots
    // backwards drew a counter passing through −12 on its way up from zero.
    const p = Math.min(1, Math.max(0, (t - t0) / COUNT_MS));
    const at = Math.round(from + (to - from) * ease(p));
    set(at);
    displayed.set(key, p < 1 ? at : to);
    if (p < 1) frame = requestAnimationFrame(step);
    else inFlight.delete(key);
  };
  // The landing value is recorded up front, so a tween cut short by the next paint
  // still leaves the counter's memory on the number that paint asked for.
  displayed.set(key, from);
  set(from);
  frame = requestAnimationFrame(step);
  inFlight.set(key, () => cancelAnimationFrame(frame));
  return node;
}

// Forget every counter — the next paint's numbers then appear rather than climb.
// What a cleared cache and a switched view have in common: the figures after are not
// a continuation of the figures before, and tweening between them would draw a
// change that did not happen.
export const resetCountUps = () => { for (const stop of inFlight.values()) stop(); inFlight.clear(); displayed.clear(); };

// --- tiles ----------------------------------------------------------------------

// `[value, label, color?, hint?]`. Colour is applied only when the tile is reporting
// something — a zero never gets an alarm colour, so a coloured tile always means
// "look at this". `hint` may be nodes rather than a string where the tile itemises
// what its number is made of.
export function tiles(node, rows) {
  node.replaceChildren(...rows.map(([v, k, color, hint]) => el('div', { className: 'tile' }, [
    countUp(el('div', { className: 'v num', style: color ? `color:${color}` : '' }), k, v),
    el('div', { className: 'k', textContent: k }),
    hint == null || hint === '' ? null
      : (typeof hint === 'string' ? el('div', { className: 'sub', textContent: hint }) : hint),
  ])));
}

// --- grouped table heads --------------------------------------------------------

// A header BAND above the column names, so a wide row reads as a few questions rather
// than as a wall of columns. `groups` is `[title, [col, …]]`; a group whose title is
// empty spans its columns unlabelled, which is what the identity column at the left
// edge wants — it belongs to no question.
export const groupedHead = (table, groups) => {
  table.replaceChildren();
  table.append(el('thead', {}, [
    el('tr', { className: 'band' }, groups.map(([title, cols]) =>
      el('th', { colSpan: cols.length, className: title ? 'group' : 'group blank', textContent: title }))),
    el('tr', {}, groups.flatMap(([, cols], gi) => cols.map((c, ci) =>
      el('th', { className: ci === 0 && gi > 0 ? 'group-start' : '', textContent: c })))),
  ]));
  return table.appendChild(el('tbody'));
};

export const columnCount = (groups) => groups.reduce((n, [, cols]) => n + cols.length, 0);

// Which cells start a group, so the body can carry the same vertical rule the band
// draws. Returns the flat column indexes a `groupedHead(groups)` would open a group at.
export const groupStarts = (groups) => {
  const out = [];
  let i = 0;
  for (const [gi, [, cols]] of groups.entries()) {
    if (gi > 0) out.push(i);
    i += cols.length;
  }
  return out;
};

// --- the day chart --------------------------------------------------------------

// A stacked column per day. SVG rather than divs because the whole point is comparing
// heights across a fortnight, and one element per segment with a `<title>` gives the
// hover text for free.
//
// The scale is stated, never implied: an unlabelled column chart invites reading two
// panels' bars against each other when their maxima differ.
export function stackedColumns(days, series, { height = 84, label = (d) => d.day } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  // `append` returns nothing, so the title is built and filled before it goes in.
  const titled = (node, text) => {
    const t = svgEl('title');
    t.textContent = text;
    node.append(t);
    return node;
  };

  const totals = days.map((d) => series.reduce((n, s) => n + (s.value(d) || 0), 0));
  const peak = Math.max(1, ...totals);
  const cols = Math.max(1, days.length);
  const gap = 3;
  const width = 100;                       // a viewBox unit grid; the CSS sizes it
  const colW = (width - gap * (cols - 1)) / cols;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none',
    class: 'chart', role: 'img',
    'aria-label': `${days.length} days, peak ${peak} on ${days[totals.indexOf(peak)]?.day ?? '—'}`,
  });

  days.forEach((d, i) => {
    const x = i * (colW + gap);
    let y = height;
    let drawn = false;
    for (const s of series) {
      const v = s.value(d) || 0;
      if (!v) continue;
      const h = (v / peak) * (height - 2);
      y -= h;
      drawn = true;
      svg.append(titled(svgEl('rect', { x, y, width: colW, height: h, fill: s.color, class: 'col' }),
        `${label(d)} — ${v} ${s.label}`));
    }
    if (!drawn) {
      svg.append(titled(svgEl('rect', { x, y: height - 1, width: colW, height: 1, fill: 'var(--rule)' }),
        `${label(d)} — nothing`));
    }
  });

  return el('div', { className: 'chart-wrap' }, [
    svg,
    el('div', { className: 'chart-axis' }, [
      el('span', { className: 'sub', textContent: days[0]?.day ?? '' }),
      el('span', { className: 'sub', textContent: `peak ${peak}/day` }),
      el('span', { className: 'sub', textContent: days[days.length - 1]?.day ?? '' }),
    ]),
  ]);
}

export const chartLegend = (series) =>
  el('div', { className: 'legend' }, series.map((s) =>
    el('span', {}, [el('i', { className: 'sw', style: `background:${s.color}` }), s.label])));

// --- windowed figures -----------------------------------------------------------

// A number with its change against the window before it. The arrow is never the whole
// message — the previous window's figure is spelled out, because a delta with nothing
// to compare it against is the vanity total this panel exists to avoid.
//
// Which DIRECTION is good is the caller's to say: more completed work is progress and
// more items needing a person is not, and a green up-arrow on the second would read as
// a boast about the fleet needing more hand-holding.
export function windowFigure(value, label, change, note, { better = 'up' } = {}) {
  const arrow = change?.dir === 'up' ? '▲' : change?.dir === 'down' ? '▼' : '—';
  const sense = !change || change.dir === 'flat' ? 'flat' : (change.dir === better ? 'good' : 'bad');
  return el('div', { className: 'tile' }, [
    countUp(el('div', { className: 'v num' }), label, value),
    el('div', { className: 'k', textContent: label }),
    change
      ? el('div', { className: `sub delta ${sense}`, textContent: `${arrow} ${change.by} vs the week before` })
      : null,
    note ? el('div', { className: 'sub', textContent: note }) : null,
  ]);
}
