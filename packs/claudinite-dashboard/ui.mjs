// Shared rendering vocabulary. Both views draw from this so a state, a duration or a
// severity looks and reads the same whether you are looking at one repo or twelve —
// a fleet page whose "blocked" chip differs from the repo page's is a page you have
// to learn twice.

import {
  BLOCKED, READY, EXECUTING, AGENT, NEEDS_HUMAN,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE,
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

export const OUTCOME_COLOR = {
  [OUTCOME_DONE]: 'var(--good)',
  [OUTCOME_DELIVERED]: 'var(--s-violet)',
  [OUTCOME_OBSOLETE]: 'var(--muted)',
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

// --- tiles ----------------------------------------------------------------------

// `[value, label, color?, hint?]`. Colour is applied only when the tile is reporting
// something — a zero never gets an alarm colour, so a coloured tile always means
// "look at this".
export function tiles(node, rows) {
  node.replaceChildren(...rows.map(([v, k, color, hint]) => el('div', { className: 'tile' }, [
    el('div', { className: 'v num', textContent: String(v), style: color ? `color:${color}` : '' }),
    el('div', { className: 'k', textContent: k }),
    hint ? el('div', { className: 'sub', textContent: hint }) : null,
  ])));
}

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
    el('div', { className: 'v num', textContent: String(value) }),
    el('div', { className: 'k', textContent: label }),
    change
      ? el('div', { className: `sub delta ${sense}`, textContent: `${arrow} ${change.by} vs the week before` })
      : null,
    note ? el('div', { className: 'sub', textContent: note }) : null,
  ]);
}
