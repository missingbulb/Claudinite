// The deep dive: one repo's scheduler in full — what is stuck, what is queued, what
// ran, and what the machinery has been doing for the last month. Reached from the
// fleet view or by `?repo=` directly.
//
// TWO KINDS OF DATA, AND THEY ARE READ DIFFERENTLY. What is true RIGHT NOW comes from
// live reads, and they are kept to a handful: the repo, its head commit, one page of
// issues and one page of runs, all ETag-revalidated so a warm load spends nothing. What
// happened BEFORE comes from one file — the repo's own `usage.GENERATED.json`, keyed by
// the head sha, so it is not re-read at all while the branch has not moved. Reaching a
// month back over the API instead would be a paginated crawl per load.
//
// Everything past the live window therefore depends on the repo folding that file. A
// repo that does not says so in the panel that wanted it, and the rest of the page is
// unaffected.

import * as gh from './github.mjs';
import {
  buildRoster, describeItem, isWorkItem, parseDeclaration, taskDeclarationPaths, periodMs,
  PARKED,
} from './model.mjs';
import {
  ciStatus, mountState, parkMinutes, summariseRuns,
} from './fleet.mjs';
import { readCanon, priceStampedPacks } from './canon.mjs';
import { workRows, rowsFor, viewCounts, defaultView, VIEWS } from './work.mjs';
import { repoCandidates } from './next-work.mjs';
import { readUsage, growthSeries, queueSeries, hourSeries } from './usage.mjs';
import { readContributions, liveSourcesNeeded } from './contributions.mjs';
import { packCard } from './contrib-view.mjs';
import {
  $, el, ago, until, stamp, duration, chip, head, emptyRow, issueLink, segmentBar,
  warnNodes, stackedColumns, chartLegend, dualAxisChart, flipRows,
  LEVEL_GLYPH, OUTCOME_COLOR,
} from './ui.mjs';
import { band, slip, machineCell, beats, wakeTicks, figureRow, pulseChart, detailTable, expander } from './sheet.mjs';
import { repoLedger, repoMachine } from './repo-ledger.mjs';
import { fmtTokens, fmtHours, fmtAge } from './fleet-ledger.mjs';
import { buildBoard } from './board.mjs';
import { renderBoard, quietLine } from './board-view.mjs';
import { buildPanel } from './explore.mjs';
import { wakeStrip } from './model.mjs';
import { settingsTextAtSha, SETTINGS_FILE } from './settings-read.mjs';

// How far each past-data panel looks back. The month is the growth panel's, because a
// fortnight of a corpus's own numbers is noise; the fortnight is the queue's, because
// that is the span over which "did this task actually close anything" is a question;
// and two days is the runs panel's, which is a live picture rather than a history.
const GROWTH_DAYS = 30;
const OUTCOME_DAYS = 14;
const RUN_HOURS = 48;

const CI_UI = {
  passing: { label: 'passing', color: 'var(--good)' },
  failing: { label: 'failing', color: 'var(--critical)' },
  running: { label: 'running', color: 'var(--s-yellow)' },
  unknown: { label: 'no run', color: null },
};

// --- at a glance -------------------------------------------------------------------

// The tiles, in the order the questions get asked: what is waiting on ME, then what is
// waiting on anyone, then what kind of repo this is and whether it is healthy.
//
// A tile is coloured only when it is REPORTING something, so a coloured tile always
// means look here — and a tile whose answer is unknown says so rather than showing a
// zero. The mount tile especially: with no canon configured there is nothing to compare
// against, and "current" would be a claim nothing checked.
const taskCell = (r) => el('td', {}, [
  el('div', { className: 'name', textContent: r.task ?? '(unparsed title)' }),
  el('div', { className: 'sub', textContent: r.pack ?? '' }),
]);

// What will actually happen to this task next, and — where the standing item rolled —
// why the last ask declined. The lever each state answers to is one line, because the
// reader's next question is always "so what do I do".
function nextAskCell(r, now) {
  const ask = r.nextAsk ?? { kind: 'note', note: r.anchorNote };
  const sub = (text) => el('div', { className: 'sub', textContent: text });
  const declined = r.current?.lastVerdict
    ? sub(`last ask declined: ${r.current.lastVerdict.reason}`) : null;
  switch (ask.kind) {
    case 'ready':
      return el('td', {}, [el('div', { textContent: ask.urgent ? 'queued — urgent, next pick' : 'queued — next pick' })]);
    case 'running':
      return el('td', {}, [el('div', { textContent: `running now (${ask.phase})` })]);
    case 'wake':
      return el('td', { className: 'num' }, [el('div', { textContent: until(ask.at, now) }), sub(stamp(ask.at.toISOString())), declined]);
    case 'anchor':
      return el('td', { className: 'num' }, [el('div', { textContent: until(ask.at, now) }), sub(stamp(ask.at.toISOString()))]);
    case 'held':
      return el('td', {}, [
        el('div', { className: 'warn critical', textContent: 'schedule held' }),
        sub('no next run until the park is cleared or re-queued'),
      ]);
    case 'deps':
      return el('td', {}, [el('div', { textContent: `after ${ask.on.map((n) => `#${n}`).join(', ')}` })]);
    case 'ready-soon':
      return el('td', {}, [el('div', { textContent: 'due — the next scheduler run readies it' })]);
    case 'off-machine':
      return el('td', {}, [el('div', { className: 'warn warning', textContent: 'off the state machine — janitor repairs it' })]);
    default:
      return el('td', {}, [sub(ask.note ?? '—')]);
  }
}

const itemCell = (r, repo) => (r.current
  ? el('td', {}, [
    issueLink(repo, r.current.number),
    r.current.urgent ? el('span', { className: 'chip urgent', textContent: 'urgent' }) : null,
    el('div', { className: 'sub', textContent: `${r.current.comments} comment${r.current.comments === 1 ? '' : 's'}` }),
  ])
  : el('td', {}, [el('span', { className: 'sub', textContent: 'no open item' })]));

function waitingCell(r) {
  const i = r.current;
  const waiting = [];
  if (i?.blockedBy?.length) waiting.push(`blocked by ${i.blockedBy.map((n) => `#${n}`).join(', ')}`);
  if (i?.notBefore) waiting.push(`wakes ${stamp(i.notBefore)}`);
  return el('td', { className: 'sub' }, [
    el('div', { textContent: waiting.join(' · ') || '—' }),
    i?.lastVerdict ? el('div', { className: 'sub', textContent: `declined: ${i.lastVerdict.reason}` }) : null,
  ]);
}

function rowCells(r, view, repo, now) {
  if (view === 'stuck') {
    return [
      taskCell(r),
      el('td', {}, r.troubles.length
        ? r.troubles.map((t) => el('div', { className: `warn ${t.level}`, textContent: `${LEVEL_GLYPH[t.level]} ${t.text}` }))
        : [el('span', { className: 'warn serious', textContent: `${LEVEL_GLYPH.serious} no declared task — nothing will pick this up` })]),
      itemCell(r, repo),
      el('td', { className: 'num', textContent: r.current ? duration(r.current.idleMs) : '—' }),
      waitingCell(r),
    ];
  }
  if (view === 'pending') {
    return [
      taskCell(r),
      el('td', {}, r.current ? [chip(r.current.state), ...warnNodes(r.current.warnings)] : []),
      itemCell(r, repo),
      nextAskCell(r, now),
      el('td', { className: 'num', textContent: r.current ? duration(r.current.idleMs) : '—' }),
    ];
  }
  const d = r.declaration ?? {};
  const tally = { done: 0, delivered: 0, obsolete: 0, none: 0 };
  for (const h of r.history) tally[h.outcome ?? 'none'] += 1;
  return [
    taskCell(r),
    el('td', {}, [
      el('div', { className: 'nw', textContent: r.frequency ?? 'unknown' }),
      el('div', { className: 'sub', textContent: d.agent_model ? `${d.agent_model} · ${d.expected_outcome ?? '—'}` : '—' }),
    ]),
    el('td', {}, r.current
      ? [chip(r.current.state), ...warnNodes(r.current.warnings),
        el('div', { className: 'sub' }, [issueLink(repo, r.current.number), ` · ${duration(r.current.idleMs)} idle`])]
      : [el('span', { className: 'sub', textContent: 'no open item' })]),
    nextAskCell(r, now),
    el('td', {}, r.lastClosed
      ? [el('div', { textContent: r.lastClosed.outcome ?? 'none' }),
        el('div', { className: 'sub', textContent: ago(r.lastClosed.closedAt, now) })]
      : [el('span', { className: 'sub', textContent: 'never run' })]),
    el('td', {}, [
      segmentBar(Object.entries(tally).map(([k, n]) => [k, n, OUTCOME_COLOR[k]])),
      el('div', { className: 'sub num', textContent: `${r.history.length} closed` }),
    ]),
  ];
}

const EMPTY = {
  stuck: 'Nothing is stuck — every task is either moving or waiting for its turn.',
  pending: 'Nothing is in flight. Every declared task is waiting for its next anchor.',
  all: 'No declared task has a tasks/ directory in this repo.',
};

// The switcher, and the repaint it drives. The rows are the same rows in every view —
// only the filter and the columns change — so they are animated from where they were to
// where they are now rather than replaced outright, which is what keeps the row a
// reader was looking at findable after a click.

// --- the ledger sheet, scoped to one member ------------------------------------------

// The same block the fleet page draws, one member deep: same bands, same tracks, same
// three unknown states. Where the fleet's ledger has four figures per column this has
// THREE and no tile row — every tile's fact moved into a cell that acts on it, and the
// height that bought is what lands the Work board above the fold.
// Exported so the sheet can be driven against a fixture — the layout and the gap
// sentences are the parts a unit test cannot see.
export function renderRepoSheet({ ledger, machine, candidates, strip, repo }) {
  const top = candidates[0] ?? null;
  const rest = Math.max(0, candidates.length - 1);

  const startBody = top
    ? slip({
      headline: top.why,
      where: `#${top.number ?? ''}`.replace('#', '') ? `#${top.number}` : repo,
      href: top.url,
      chip: parkChipFor(top),
      more: [rest ? `${rest} more after this one` : null, top.title].filter(Boolean).join(' · '),
    })
    : el('div', { className: 'slip' }, [
      el('span', { className: 'hl', textContent: 'Nothing is waiting on you' }),
      el('span', { className: 'more', textContent: 'nothing here is parked, failing or off the state machine' }),
    ]);

  const m = machine;
  const machineBody = el('div', { className: 'machine repo' }, [
    machineCell({
      level: m.scheduler.level, label: 'Scheduler',
      value: m.scheduler.lastAt === null ? null : fmtAge(Date.now() - m.scheduler.lastAt),
      unit: m.scheduler.lastAt === null ? 'never seen' : 'since the last run',
      note: m.scheduler.note,
      // One square per HOUR, not per member: the question one level down is whether it
      // ran when it should have, hour by hour.
      extra: el('div', { className: 'beat hours' }, m.scheduler.squares.map((sq) =>
        el('i', { className: sq.state === 'ran' ? '' : sq.state, title: sq.title }))),
    }),
    machineCell({
      level: m.executor.level, label: 'Executor',
      value: m.executor.failed, unit: `of ${m.executor.runs} failed, 24h`, note: m.executor.note,
    }),
    machineCell({
      level: m.ci?.level ?? 'none', label: 'CI on main',
      value: m.ci?.word ?? null, unit: m.ci?.when ?? '', note: m.ci?.note ?? 'no run on the default branch',
    }),
    machineCell({
      level: m.foldAge.level, label: 'Fold age',
      value: m.foldAge.age === null ? null : fmtAge(m.foldAge.age), unit: 'old', note: m.foldAge.note,
    }),
    machineCell({
      level: m.drift.level, label: 'Drift',
      value: m.drift.state === 'current' ? 'current' : (m.drift.state === null ? null : 'behind'),
      unit: '', note: m.drift.note,
    }),
    machineCell({
      level: m.wake.level, label: 'Next wake',
      value: m.wake.at ? `${m.wake.at.slice(11)}:00` : null,
      unit: m.wake.at ? `${m.wake.tasks} task${m.wake.tasks === 1 ? '' : 's'}` : 'nothing in 24 h',
      note: m.wake.note,
      extra: strip ? wakeTicks(strip) : null,
    }),
  ]);

  const column = (name, question, figs, formats, tail) => el('div', { className: 'col' }, [
    el('h3', {}, [
      el('span', { className: 'cap', textContent: name }),
      el('span', { className: 'q', textContent: question }),
    ]),
    ...figs.map((f, i) => figureRow(f, { format: formats[i] })),
    // The tail line: one fact that is nowhere else on the block, in the muted step
    // under its column rather than spending a whole row on it.
    el('div', { className: 'tailrow', textContent: tail }),
  ]);

  const t = ledger.totals;
  const detail = el('div', { className: 'detail', hidden: true }, [perTaskTable(ledger)]);
  const totals = el('div', { className: 'totals' }, [
    el('div', {}, [
      el('b', { textContent: t.costPerMerged === null ? '—' : `≈$${t.costPerMerged}` }),
      'per merged PR',
      el('span', { className: 'sub', textContent: t.tokensPerMerged === null ? 'not recorded' : `${fmtTokens(Math.round(t.tokensPerMerged))} tok each` }),
    ]),
    el('div', {}, [
      el('b', { textContent: t.autonomy === null ? '—' : `${Math.round(t.autonomy * 100)}%` }),
      'autonomy',
      el('span', { className: 'sub', textContent: t.humanToAgent === null ? 'yours : agent minutes not recorded' : `yours : agent 1 : ${t.humanToAgent}` }),
    ]),
    el('div', {}, [
      el('b', { textContent: t.caught === null ? '—' : String(t.caught) }),
      'would have shipped broken',
      expander('per task', detail),
    ]),
  ]);

  const pulseNote = [
    ledger.pulse.peak === null ? 'nothing folded' : `peak ${ledger.pulse.peak}`,
    'today not folded yet',
  ].join(' · ');

  $('repo-sheet').replaceChildren(
    band('Start here', 'worst thing needing a person', startBody, { aria: 'Start here' }),
    band('The machine', 'is this scheduler running, on cadence', machineBody, { aria: 'The machine' }),
    band('This week', `against last · ${ledger.window.from} – ${ledger.window.to}`, [
      el('div', { className: 'ledger' }, [
        column('Got', 'what this repo produced', ledger.ledger.got, [String, String, String], ledger.tails.got),
        column('Cost', 'what it took here', ledger.ledger.cost, [fmtTokens, (n) => `≈$${n}`, fmtTokens], ledger.tails.cost),
        column('Speed', 'how fast it moves, where it sticks', ledger.ledger.speed, [fmtHours, String, String], ledger.tails.speed),
      ]),
      totals,
      detail,
    ], { aria: 'This week against last' }),
    band('Pulse', 'sessions / day, 14 days',
      el('div', { className: 'pulse' }, [pulseChart(ledger.pulse), el('span', { className: 'n', textContent: pulseNote })]),
      { aria: 'Pulse' }),
  );
}

const parkChipFor = (candidate) => {
  const minutes = parkMinutes(candidate.park);
  const kind = candidate.park?.triage ? String(candidate.park.triage).split('-').pop() : null;
  if (minutes == null) return kind ? `${kind} · no time estimate` : 'no time estimate';
  return `${minutes} min${kind ? ` · ${kind}` : ''}`;
};

// The expand only a repo page can offer: what each task closed, what it cost, and what
// it kept parking on. Three rows here are STATES rather than tasks — `(none)` is the
// share a person started, `(unresolved)` a hole in the record — and they are kept
// visible rather than folded into the tasks around them.
function perTaskTable(ledger) {
  const rows = ledger.perTask.slice(0, 20).map((t) => ([
    t.key,
    `${t.closed.done + t.closed.delivered} / ${t.closed.obsolete} / ${t.closed.none}`,
    t.sessions ?? '—',
    t.tokensIn === null ? '—' : fmtTokens(t.tokensIn),
    t.tokensPerClose === null ? '—' : fmtTokens(t.tokensPerClose),
    t.execFailed || '—',
    t.parks || '—',
    t.model ?? '—',
  ]));
  if (!rows.length) rows.push([{ text: 'no task closed anything or spent anything in this window', gap: true, colSpan: 8 }]);
  return detailTable([
    { label: 'Task' }, { label: 'done / obsolete / none', num: true }, { label: 'Sessions', num: true },
    { label: 'Tokens in', num: true }, { label: 'Tok / close', num: true }, { label: 'Exec failed', num: true },
    { label: 'Parked', num: true }, { label: 'Model' },
  ], rows);
}

// --- the Work board ---------------------------------------------------------------------

// The board and the three tables are one switcher: `board` is `workRows`'s own
// classification drawn in time, so the views cannot disagree about what is stuck.
function renderWorkBoard(board, { repo, items, prs, rows, now, comments = new Map() }) {
  const node = $('work-board');
  const explore = $('work-explore');

  const open = (row) => {
    const number = Number(String(row.gutter).match(/#(\d+)/)?.[1] ?? NaN);
    const item = items.find((i) => i.number === number) ?? null;
    const parsed = item ? rows.find((r) => r.current?.number === number) : null;
    const siblings = parsed ? items.filter((i) => (i.title ?? '').includes(parsed.key)) : [];
    const panel = buildPanel(row, {
      item, repo, items, prs, rows,
      declaration: parsed?.declaration ?? row.row?.declaration ?? null,
      siblings,
      comments: comments.get(number) ?? null,
      cost: ledgerCostFor(row),
      now,
    });
    explore.replaceChildren(el('div', { className: 'explore one' }, [panelNode(panel)]));
  };

  node.replaceChildren(renderBoard(board, { onSelect: open }), quietLine(board.quiet));
  // One panel is open at rest — the board's own worst finding written out, because a
  // board whose finding is one click away is a board nobody clicks.
  const worst = board.groups.flatMap((g) => (g.grid ? [] : g.shown)).find((r) => r.broken || r.parkKind === 'failure')
    ?? board.groups[0]?.shown?.[0] ?? null;
  if (worst) open(worst);
  else explore.replaceChildren();
}

const ledgerCostFor = () => null;

// The CI cell, from `ciStatus`'s own verdict. Failing is CRITICAL here and nowhere
// else on the block: nothing the queue lands on a red main is safe, and that is a
// different claim from a task being slow.
const CI_LEVEL = { passing: 'good', failing: 'critical', running: 'machine', unknown: 'none' };
export function ciCell(ci, now) {
  return {
    level: CI_LEVEL[ci.state] ?? 'none',
    word: ci.state === 'unknown' ? null : ci.state,
    when: ci.at ? ago(ci.at, now) : '',
    note: ci.name ? `${ci.name}${ci.state === 'failing' ? ' — nothing the queue lands is safe' : ''}` : 'no run on the default branch',
  };
}

function panelNode(panel) {
  return el('div', { className: 'panel-x' }, [
    el('h4', {}, [panel.title]),
    el('dl', {}, panel.fields.flatMap((f) => [
      el('dt', { textContent: f.label }),
      el('dd', { className: f.value === null ? 'gap' : '', textContent: f.value ?? f.note }),
    ])),
    el('div', { className: 'do' }, [
      el('b', { textContent: 'do' }),
      ...(panel.do.includes('\n')
        ? [panel.do.split('\n')[0], el('pre', { textContent: panel.do.split('\n').slice(1).join('\n') })]
        : [panel.do]),
    ]),
  ]);
}

export function renderWork(all, repo, now, view, board = null, context = null) {
  const counts = viewCounts(all);
  const table = $('work');
  const boardView = view === 'board';
  $('work-board').hidden = !boardView;
  $('work-explore').hidden = !boardView;
  $('work-table-wrap').hidden = boardView;
  if (boardView) {
    if (board) renderWorkBoard(board, context);
    paintTabs();
    return;
  }

  const paint = () => {
    const body = head(table, COLUMNS[view]);
    const rows = rowsFor(all, view);
    if (!rows.length) { body.append(emptyRow(COLUMNS[view].length, EMPTY[view])); return body; }
    for (const r of rows) {
      const tr = el('tr', { className: r.level === 'ok' ? '' : `lvl-${r.level}` }, rowCells(r, view, repo, now));
      tr.dataset.k = r.key;
      body.append(tr);
    }
    return body;
  };

  // The first paint has nothing to move from; later ones do.
  const body = table.querySelector('tbody');
  if (body) flipRows(body, () => paint());
  else paint();

  paintTabs();

  // The board is a tab beside the three tables rather than above them: the same rows,
  // drawn in time. Its count is what the board actually holds — lanes plus grid rows —
  // so the switcher says what it is offering instead of making the reader click.
  function paintTabs() {
    const boardCount = board ? board.groups.reduce((n, g) => n + g.count, 0) : 0;
    const tabs = board ? ['board', ...VIEWS] : [...VIEWS];
    $('work-views').replaceChildren(...tabs.map((v) => el('button', {
      className: `view-tab${v === view ? ' on' : ''}`,
      textContent: `${v} · ${v === 'board' ? boardCount : counts[v]}`,
      'aria-pressed': String(v === view),
      onclick: () => renderWork(all, repo, now, v, board, context),
    })));
  }
}

// --- what the queue closed -----------------------------------------------------------

const OUTCOME_SERIES = [
  { label: 'done', color: OUTCOME_COLOR.done, value: (d) => d.done },
  { label: 'delivered', color: OUTCOME_COLOR.delivered, value: (d) => d.delivered },
  { label: 'obsolete', color: OUTCOME_COLOR.obsolete, value: (d) => d.obsolete },
  { label: 'no outcome', color: OUTCOME_COLOR.none, value: (d) => d.none },
];

function renderOutcomes(series, usage) {
  const node = $('work-chart');
  const read = series.filter((d) => d.source !== 'none');
  const closed = read.reduce((n, d) => n + d.done + d.delivered + d.obsolete + d.none, 0);
  node.replaceChildren(
    el('div', { className: 'chart-card' }, [
      el('div', {
        className: 'k',
        textContent: usage
          ? `${closed} work item(s) closed in ${read.length} folded day(s)`
          : 'this repo folds no usage file — only today is visible',
      }),
      chartLegend(OUTCOME_SERIES),
      stackedColumns(series, OUTCOME_SERIES),
      el('div', {
        className: 'sub',
        textContent: 'Today is counted from the live issue page; the days before it from the repo\'s own '
          + 'usage fold. A day neither reached is left blank rather than drawn as a quiet one.',
      }),
    ]),
  );
}

// --- what ran, hour by hour -------------------------------------------------------

const RUN_SERIES = [
  { label: 'scheduler runs', color: 'var(--s-blue)', value: (h) => h.scheduler },
  { label: 'executor runs', color: 'var(--s-aqua)', value: (h) => h.executor },
  { label: 'agent sessions', color: 'var(--s-violet)', value: (h) => h.agentic },
];

// What an hour was ABOUT, for the hover: which tasks executed in it and how they ended.
// The runs listing cannot say — nothing in it names a task — so this is the folded
// file's answer or nothing, and an hour the fold has not reached says so instead of
// implying the hour was empty.
function hourDetail(h) {
  if (h.source === 'none') return 'not folded yet';
  const lines = h.tasks.map((t) => `${t.key}: ${t.statuses.map((s) => `${s.count} ${s.status}`).join(', ')}`);
  if (!lines.length) return h.agentic ? 'no task execution recorded' : null;
  return lines.join('\n');
}

function renderRuns(hours) {
  const node = $('runs-chart');
  const totals = RUN_SERIES.map((s) => hours.reduce((n, h) => n + (s.value(h) ?? 0), 0));
  const failed = hours.reduce((n, h) => n + (h.failed ?? 0), 0);
  const unfolded = hours.filter((h) => h.source === 'none').length;

  node.replaceChildren(
    el('div', { className: 'chart-card' }, [
      el('div', {
        className: 'k',
        textContent: `${totals[0]} scheduler · ${totals[1]} executor · ${totals[2]} agent session(s)`
          + `${failed ? ` · ${failed} failed` : ''} in ${RUN_HOURS}h`,
      }),
      chartLegend(RUN_SERIES),
      stackedColumns(hours, RUN_SERIES, { label: (h) => `${h.hour.replace('T', ' ')}:00Z`, detail: hourDetail }),
      el('div', {
        className: 'sub',
        textContent: unfolded
          ? `${unfolded} of these hours are not in the repo's usage fold, and the live run listing does not `
            + 'reach them — they are blank rather than drawn as quiet.'
          : 'The freshest hours come from the live run listing; the rest from the repo\'s own usage fold. '
            + 'Hover an hour for the tasks that ran in it.',
      }),
    ]),
  );
}

// --- what the corpus is doing --------------------------------------------------------

// The growth panel: what Claudinite put INTO this repo's sessions, and what came back.
// Two series on two scales — rule tokens are five figures a day and check runs are
// single ones, so a shared axis would draw the second as the x-axis.
function renderGrowth(growth) {
  const node = $('growth');
  if (!growth.folded) {
    node.replaceChildren(el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: 'no usage fold in this repo' }),
      el('p', {
        className: 'sub',
        textContent: 'These figures come from `.claudinite/local/usage.GENERATED.json`, which the '
          + 'claudinite-growth pack\'s usage-fold task writes. Declare that pack and the panel fills in from '
          + 'its first run; nothing else on this page depends on it.',
      }),
    ]));
    return;
  }

  const left = { label: 'rule tokens in session prompts', color: 'var(--s-violet)', value: (d) => d.ruleTokens, format: (n) => n.toLocaleString() };
  const right = { label: 'checks executed', color: 'var(--good)', value: (d) => d.checkRuns };

  // The aspirational series. Each is shown when the file carries it and NAMED as absent
  // when it does not — a stated gap is information, an empty chart is not.
  const optional = [
    ['tokens', growth.totals.tokensIn === null ? null
      : `${fmt(growth.totals.tokensIn + growth.totals.tokensOut)} tokens spent on sessions`,
    'no session in the window recorded token usage'],
    ['commits', growth.totals.linesAdded === null ? null
      : `${fmt(growth.totals.linesAdded)} lines added · ${fmt(growth.totals.linesRemoved)} removed over ${fmt(growth.totals.commits)} commits`,
    'the fold\'s checkout could not read this far back'],
    ['releases', growth.totals.releases === null ? null
      : `${growth.totals.releases} release${growth.totals.releases === 1 ? '' : 's'} published`,
    'the releases listing was not read'],
  ];

  node.replaceChildren(
    el('div', { className: 'chart-card wide' }, [
      el('div', {
        className: 'k',
        textContent: `${fmt(growth.totals.checkRuns)} check run(s), ${fmt(growth.totals.checkFailures)} of them catching something, over ${GROWTH_DAYS} days`,
      }),
      dualAxisChart(growth.days, left, right),
      el('div', { className: 'sub', textContent: `${growth.from} → ${growth.to}. Each line is on its own scale — the two heights do not compare.` }),
    ]),
    el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: 'and over the same month' }),
      el('div', { className: 'needs' }, optional.map(([, said, missing]) =>
        el('div', { className: said ? '' : 'sub', textContent: said ?? `not recorded — ${missing}` }))),
    ]),
  );
}

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString());

// --- what the packs report ---------------------------------------------------------

// LAST on the page, and the only region whose contents differ from repo to repo:
// everything above it is the scheduler, which every member has. A repo whose declared
// packs contribute nothing never sees the section at all — the common case, since most
// packs carry conventions rather than state.
function renderContributions(contributions, now) {
  const section = $('pack-metrics');
  const node = $('pack-cards');
  if (!contributions.length) { section.hidden = true; node.replaceChildren(); return; }
  section.hidden = false;
  node.replaceChildren(...contributions.map((c) => packCard(c, now)));
}

// --- entry -----------------------------------------------------------------------

export async function loadRepo({ repo, token, config = null, onError }) {
  gh.resetCounters();
  const now = Date.now();

  const meta = await gh.getRepo(repo, token);
  const headCommit = await gh.getHead(repo, meta.default_branch, token);
  const sha = headCommit.sha;

  const configText = await settingsTextAtSha(gh, repo, sha, token);
  if (!configText) onError?.(`${repo} has no ${SETTINGS_FILE} — it does not run Claudinite, so there are no declared tasks.`);
  let declaration = null;
  try { declaration = configText ? JSON.parse(configText) : null; } catch {
    onError?.(`${SETTINGS_FILE} is present but is not valid JSON — the roster will be empty.`);
  }
  const schedule = declaration?.taskScheduler ?? null;
  if (declaration && !schedule) onError?.('No taskScheduler block — next-anchor times cannot be computed.');

  const [{ paths, truncated }, runs, issuePage, usage] = await Promise.all([
    gh.listTreeAtSha(repo, sha, token).catch((e) => { onError?.(`The tree could not be read — ${e.message}`); return { paths: [], truncated: false }; }),
    gh.listRuns(repo, token).catch((e) => { onError?.(`Actions unreadable — ${e.message}`); return []; }),
    gh.listIssues(repo, token),
    // The past-data plane. Keyed by the head sha, so this costs one request the first
    // time the branch moves and nothing afterwards.
    readUsage(repo, sha, token),
  ]);
  if (truncated) onError?.('GitHub truncated the tree listing — some tasks may be missing from the roster.');

  const declPaths = declaration ? taskDeclarationPaths(paths, declaration) : [];
  const tasks = await Promise.all(declPaths.map(async (t) => ({
    ...t,
    declaration: parseDeclaration(await gh.getTextAtSha(repo, sha, t.path, token)),
  })));

  const items = issuePage.issues.filter(isWorkItem);
  // Whether a Blocked-by issue is still open, from the page already fetched. A
  // blocker outside that window answers null — unknown, which is never alarmed on.
  const byNumber = new Map(issuePage.issues.map((i) => [i.number, i.state === 'open']));
  const isOpen = (n) => byNumber.get(n) ?? null;
  const rows = buildRoster({ tasks, items, now, schedule, isOpen });
  const periodFor = (k) => {
    const f = rows.find((r) => r.key === k)?.frequency;
    return f && f !== 'manual' ? periodMs(f) : null;
  };
  const open = items.filter((i) => i.state === 'open').map((i) => describeItem(i, now, { periodFor, isOpen }));

  // The canon reference for the drift tile. Optional in every direction: with none
  // configured the tile reads `unknown` rather than inventing `current`.
  const canon = await readCanon(config, token);
  if (canon) await priceStampedPacks(canon, declaration);

  // What this repo's own packs report. Discovery is free — the declaration and the
  // tree listing are both already in hand — and every read below is content at a sha,
  // so a warm load spends nothing on it.
  const contributions = await readContributions({ repo, sha, token, declaration, paths, gh });
  const needed = liveSourcesNeeded(contributions);
  const live = {
    stars: meta.stars,
    release: needed.has('latest-release') ? await gh.latestRelease(repo, token).catch(() => undefined) : undefined,
  };
  for (const c of contributions) c.live = live;

  const all = workRows(rows, open);
  const counts = viewCounts(all);

  // The lead, from the same rows the work table is drawn from — one derivation, so the
  // block at the top and the first row of the `stuck` view are one verdict.
  const candidates = repoCandidates(repo, all);

  // The ledger sheet. The rate table is the deployment's own; unset is supported and
  // reads *unpriced*, naming the key. The fleet mean is only available where the page
  // holds other members' folds, so on a repo-mode deployment it reads *fleet: not read*.
  const hours = hourSeries(usage, { now, hours: RUN_HOURS, runs });
  const strip = wakeStrip(rows, now);
  const ledger = repoLedger({ repo, declaration, usage, items: issuePage.issues, prs: issuePage.prs }, {
    now, rates: config?.rates ?? null, fleetMean: config?.fleetTokensPerSession ?? null,
  });
  const machine = repoMachine({
    hourRows: hours,
    runSummary: summariseRuns(runs, now, usage),
    ci: ciCell(ciStatus(runs, meta.default_branch), now),
    usage,
    mount: declaration ? mountState(declaration, canon) : null,
    canon,
    strip,
    declaredTasks: tasks.length,
    now,
  });
  renderRepoSheet({ ledger, machine, candidates, strip, repo });

  // The board is `workRows`'s own classification drawn in time, from the same issues
  // and PRs the tables read — one derivation, so a mark and a row cannot disagree.
  const board = buildBoard({ rows, items: issuePage.issues, prs: issuePage.prs, now, schedule });
  const boardContext = { repo, items: issuePage.issues, prs: issuePage.prs, rows: all, now };
  const anythingLive = counts.stuck || counts.pending;
  renderWork(all, repo, now, anythingLive ? 'board' : defaultView(counts), board, boardContext);
  renderContributions(contributions, now);
  // Today's closes come from the issue page already fetched — the fold's own read is
  // watermarked and hourly, so the last hour or two is exactly what it has not seen.
  renderOutcomes(queueSeries(usage, {
    now,
    days: OUTCOME_DAYS,
    liveFrom: startOfToday(now),
    items: items.filter((i) => i.state === 'closed').map((i) => ({ closedAt: i.closed_at, outcome: outcomeWord(i) })),
  }), usage);
  renderRuns(hourSeries(usage, { now, hours: RUN_HOURS, runs }));
  renderGrowth(growthSeries(usage, { now, days: GROWTH_DAYS }));

  return {
    now, sha, branch: meta.default_branch, taskCount: tasks.length, itemCount: items.length, issuePage,
    usage, generated: usage?.generated ?? null, headCommittedAt: headCommit.committedAt,
  };
}

const startOfToday = (now) => Math.floor(now / 86400e3) * 86400e3;

// The item's outcome word, in the same vocabulary the fold writes into the file, so the
// live top-up and the folded days stack in one chart.
const outcomeWord = (i) => describeItem(i, Date.now()).outcome ?? 'none';
