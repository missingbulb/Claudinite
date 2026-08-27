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
  ciStatus, humanWork, mountState, estimateMinutes, estimateNote, attentionBreakdown,
  parkMinutes, parkMinutesNote,
} from './fleet.mjs';
import { readCanon, priceStampedPacks } from './canon.mjs';
import { workRows, rowsFor, viewCounts, defaultView, attentionOf, VIEWS } from './work.mjs';
import { repoCandidates } from './next-work.mjs';
import { readUsage, growthSeries, queueSeries, hourSeries } from './usage.mjs';
import { readContributions, liveSourcesNeeded } from './contributions.mjs';
import { packCard } from './contrib-view.mjs';
import {
  $, el, ago, until, stamp, duration, chip, head, emptyRow, issueLink, leadCard, tiles, segmentBar,
  warnNodes, stackedColumns, chartLegend, dualAxisChart, flipRows,
  LEVEL_GLYPH, OUTCOME_COLOR,
} from './ui.mjs';
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
function renderTiles({ open, runs, meta, work, mount, ci, now }) {
  const attention = attentionOf(open);
  const minutes = estimateMinutes(attention);
  const needs = attentionBreakdown(attention);
  const parked = open.filter((i) => i.state === PARKED);
  const inflight = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued');

  const needsNodes = needs.length
    ? el('div', { className: 'needs' }, needs.map((r) =>
      el('div', { className: `warn ${r.level}`, textContent: `${LEVEL_GLYPH[r.level]} ${r.text}` })))
    : 'nothing waiting';

  // One word, because it is a tile value and the detail line beneath it carries the
  // rest. `unknown` is not `current`: with no canon configured there is nothing to
  // compare against, and a scheduler run would be claiming a check that never happened.
  const mountLabel = {
    current: 'current', behind: 'behind', 'behind-engine': 'engine behind',
    unversioned: 'unversioned', none: 'no stamp', unknown: 'unknown',
  }[mount?.state] ?? 'unknown';

  // The labels are fixed rather than pluralised to their own value: a tile's label is
  // its identity across paints (`countUp` keys on it), so a label that changed with the
  // count would make the counter re-appear instead of counting to its new value.
  tiles($('tiles'), [
    // The one figure here that is a quantity of YOUR time rather than a count of the
    // machine's things, and the assumption behind it is published beside it.
    [minutes || '—', 'minutes waiting on you', minutes ? 'var(--critical)' : null,
      estimateNote(attention)],
    [parked.length, 'items parked for a person', parked.length ? 'var(--critical)' : null, needsNodes],
    [work.prs, 'pull requests open', null,
      work.prsOldest ? `oldest ${duration(now - work.prsOldest)}${work.drafts ? ` · ${work.drafts} draft` : ''}` : 'none'],
    [work.issues, 'issues open', null,
      work.issuesOldest ? `oldest ${duration(now - work.issuesOldest)}` : 'none open in the window'],
    [CI_UI[ci?.state]?.label ?? 'no run', `CI on ${meta.default_branch}`,
      ci?.state === 'failing' ? 'var(--critical)' : null,
      ci?.at ? `${ago(ci.at, now)}${ci.name ? ` · ${ci.name}` : ''}` : 'nothing completed in the window'],
    [inflight.length, 'runs in flight', inflight.length ? 'var(--s-yellow)' : null,
      inflight.length ? inflight.map((r) => r.name).filter(Boolean).slice(0, 2).join(', ') : ''],
    [meta.stars ?? '—', 'stars', null, meta.private ? 'private' : ''],
    [mountLabel, 'drift from the canon',
      mount?.state === 'behind-engine' ? 'var(--serious)' : null,
      mountDetail(mount)],
  ]);
}

const mountDetail = (mount) => {
  if (!mount) return 'no canon configured to compare against';
  if (mount.state === 'behind') return (mount.behindPacks ?? []).map((p) => p.pack).join(', ');
  if (mount.state === 'behind-engine') return `engine v${mount.engineVersion} < canon v${mount.canonEngineVersion}`;
  if (mount.state === 'unknown') return 'no canon configured to compare against';
  return mount.engineVersion != null ? `engine v${mount.engineVersion}` : '';
};

// --- the work table ------------------------------------------------------------------

// One row per piece of work; the view decides which rows and which columns. Which rows
// is `work.mjs`' business; this is only the drawing.
//
// The three column sets are genuinely different questions, which is the reason the
// views exist at all rather than one table with a filter: STUCK wants to know what is
// wrong and how long it has been, PENDING wants where it is and what happens next, ALL
// wants what this task IS and what it has done.
const COLUMNS = {
  stuck: ['Task', 'What is wrong', 'Item', 'Stuck for', 'Waiting on'],
  pending: ['Task', 'State', 'Item', 'Next ask', 'Idle'],
  all: ['Task', 'Cadence', 'Now', 'Next ask', 'Last outcome', 'Outcomes seen'],
};

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
function renderWork(all, repo, now, view) {
  const counts = viewCounts(all);
  const table = $('work');

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

  $('work-views').replaceChildren(...VIEWS.map((v) => el('button', {
    className: `view-tab${v === view ? ' on' : ''}`,
    textContent: `${v} · ${counts[v]}`,
    'aria-pressed': String(v === view),
    onclick: () => renderWork(all, repo, now, v),
  })));
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
  const lead = candidates[0] ?? null;
  $('repo-lead').replaceChildren(leadCard(lead, {
    rest: candidates.length - 1,
    minutes: parkMinutes(lead?.park),
    note: parkMinutesNote(lead?.park),
  }));

  renderTiles({
    open,
    runs,
    meta,
    work: humanWork(issuePage.issues, issuePage.prs, now),
    mount: declaration ? mountState(declaration, canon) : null,
    ci: ciStatus(runs, meta.default_branch),
    now,
  });
  renderWork(all, repo, now, defaultView(counts));
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
