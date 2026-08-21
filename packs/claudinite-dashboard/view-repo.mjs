// The deep dive: one repo's scheduler in full — every declared task, the live queue,
// and the runs behind them. Reached from the fleet view or by `?repo=` directly.

import * as gh from './github.mjs';
import {
  buildRoster, describeItem, isWorkItem, parseDeclaration, taskDeclarationPaths, periodMs,
  PARKED,
} from './model.mjs';
import {
  $, el, ago, until, stamp, duration, chip, head, groupedHead, columnCount, groupStarts,
  emptyRow, issueLink, tiles, segmentBar, warnNodes, OUTCOME_COLOR,
} from './ui.mjs';

// The roster answers three questions about a task and they do not mix: what it was
// DECLARED as, where it stands NOW, and what it has done. Same split as the fleet
// grid's, one level down.
const ROSTER_GROUPS = [
  ['', ['Task']],
  ['Declared', ['Cadence', 'Model', 'Ceiling']],
  ['Now', ['Current item', 'Next ask']],
  ['History', ['Last outcome', 'Outcomes seen']],
];
const ROSTER_STARTS = groupStarts(ROSTER_GROUPS);
const bandedRoster = (cells) => cells.map((cell, i) => {
  if (ROSTER_STARTS.includes(i)) cell.classList.add('group-start');
  return cell;
});

function renderTiles(rows, open, runs, now) {
  const inflight = runs.filter((r) => r.status === 'in_progress' || r.status === 'queued');
  const parked = open.filter((i) => i.state === PARKED);
  const warned = open.filter((i) => i.warnings.length && i.state !== PARKED);
  // The soonest DATED ask. A ready or running task is acting now, not "in 0m", so it
  // is the queue panel's news rather than this tile's.
  const soonest = rows.map((r) => r.nextAsk?.at).filter(Boolean).sort((a, b) => a - b)[0] ?? null;

  tiles($('tiles'), [
    [rows.length, 'tasks declared'],
    [open.length, 'open work items'],
    [parked.length, 'parked for a human', parked.length ? 'var(--critical)' : null],
    [warned.length, 'tripping recovery', warned.length ? 'var(--serious)' : null],
    [inflight.length, 'runs in flight', inflight.length ? 'var(--s-yellow)' : null],
    [soonest ? until(soonest, now).replace('in ', '') : '—', 'to next ask'],
  ]);
}

// The Next ask cell: what will actually happen to this task next, and — where the
// standing item rolled — why the last ask declined. The lever each state answers to
// is one line, because the reader's next question is always "so what do I do".
function nextAskCell(r, now) {
  const ask = r.nextAsk ?? { kind: 'note', note: r.anchorNote };
  const sub = (text) => el('div', { className: 'sub', textContent: text });
  const declined = r.current?.lastVerdict
    ? el('div', { className: 'sub', textContent: `last ask declined: ${r.current.lastVerdict.reason}` }) : null;
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

// Sort key for the roster: what acts soonest first. Acting now beats every date,
// dated asks order by time, and a held or unreadable schedule sinks to the bottom —
// it has no "next".
function askOrder(r) {
  const ask = r.nextAsk ?? { kind: 'note' };
  if (ask.kind === 'ready' || ask.kind === 'running' || ask.kind === 'ready-soon') return 0;
  if (ask.at) return ask.at.getTime();
  return Infinity;
}

function renderRoster(rows, repo, now, scanComplete) {
  const body = groupedHead($('roster'), ROSTER_GROUPS);
  if (!rows.length) {
    body.append(emptyRow(columnCount(ROSTER_GROUPS), 'No declared task has a tasks/ directory in this repo.'));
    return;
  }

  for (const r of rows.sort((a, b) => askOrder(a) - askOrder(b))) {
    const d = r.declaration ?? {};
    const tally = { done: 0, delivered: 0, obsolete: 0, none: 0 };
    for (const h of r.history) tally[h.outcome ?? 'none'] += 1;

    const nowCell = r.current
      ? el('td', {}, [chip(r.current.state), ...warnNodes(r.current.warnings),
        el('div', { className: 'sub' }, [issueLink(repo, r.current.number), ` · ${duration(r.current.idleMs)} idle`])])
      : el('td', {}, [el('span', { className: 'sub', textContent: 'no open item' })]);

    body.append(el('tr', {}, bandedRoster([
      el('td', {}, [
        el('div', { className: 'name', textContent: r.task }),
        el('div', { className: 'sub', textContent: r.pack }),
      ]),
      el('td', {}, [
        el('div', { className: 'nw', textContent: r.frequency ?? 'unknown' }),
        d.precondition_signals?.length
          ? el('div', { className: 'sub', textContent: d.precondition_signals.join(', ') })
          : el('div', { className: 'sub', textContent: d.has_precondition ? 'unconditional signals' : 'no precondition' }),
      ]),
      el('td', { className: 'nw', textContent: d.agent_model ?? '—' }),
      el('td', { className: 'nw', textContent: d.expected_outcome ?? '—' }),
      nowCell,
      nextAskCell(r, now),
      el('td', {}, r.lastClosed
        ? [el('div', { textContent: r.lastClosed.outcome ?? 'none' }),
          el('div', { className: 'sub', textContent: ago(r.lastClosed.closedAt, now) })]
        : [el('span', { className: 'sub', textContent: scanComplete ? 'never run' : 'none in window' })]),
      el('td', {}, [
        segmentBar(Object.entries(tally).map(([k, n]) => [k, n, OUTCOME_COLOR[k]])),
        el('div', { className: 'sub num', textContent: `${r.history.length} closed` }),
      ]),
    ])));
  }
}

function renderQueue(open, repo, now) {
  const body = head($('queue'), ['Item', 'Task', 'State', 'Waiting on', 'Idle', 'Comments']);
  if (!open.length) { body.append(emptyRow(6, 'The queue is empty — no open work item.')); return; }

  // Parked and warned first: the reason to open this panel is what is wrong.
  const rank = (i) => (i.state === PARKED ? 0 : i.warnings.length ? 1 : 2);
  for (const i of open.sort((a, b) => rank(a) - rank(b) || b.idleMs - a.idleMs)) {
    const waiting = [];
    if (i.blockedBy.length) waiting.push(`blocked by ${i.blockedBy.map((n) => `#${n}`).join(', ')}`);
    if (i.notBefore) waiting.push(`wakes ${stamp(i.notBefore)}`);

    body.append(el('tr', {}, [
      el('td', {}, [issueLink(repo, i.number), i.urgent ? el('span', { className: 'chip urgent', textContent: 'urgent' }) : null]),
      el('td', {}, [
        el('div', { className: 'name', textContent: i.task ?? '(unparsed title)' }),
        el('div', { className: 'sub', textContent: i.pack ?? '' }),
      ]),
      el('td', {}, [chip(i.state), ...warnNodes(i.warnings)]),
      el('td', { className: 'sub' }, [
        el('div', { textContent: waiting.join(' · ') || '—' }),
        // The roll's record: why the last ask declined, so "why didn't it run" is
        // answered on the row instead of a click into the issue.
        i.lastVerdict ? el('div', { className: 'sub', textContent: `declined: ${i.lastVerdict.reason}` }) : null,
      ]),
      el('td', { className: 'num', textContent: duration(i.idleMs) }),
      el('td', { className: 'num', textContent: String(i.comments) }),
    ]));
  }
}

function renderRuns(runs, now) {
  const body = head($('runs'), ['Workflow', 'Status', 'Event', 'Branch', 'Started']);
  if (!runs.length) { body.append(emptyRow(5, 'No Actions runs visible.')); return; }

  const color = (r) => {
    if (r.status !== 'completed') return 'var(--s-yellow)';
    if (r.conclusion === 'success') return 'var(--good)';
    if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') return 'var(--muted)';
    return 'var(--critical)';
  };
  for (const r of runs.slice(0, 20)) {
    const label = r.status === 'completed' ? (r.conclusion ?? 'completed') : r.status.replace('_', ' ');
    body.append(el('tr', {}, [
      el('td', {}, [el('a', { href: r.html_url, target: '_blank', rel: 'noopener', textContent: r.name ?? '(workflow)' })]),
      // Icon + word, so a run's health never rests on the dot's colour.
      el('td', {}, [el('span', { className: 'chip' }, [el('i', { className: 'dot', style: `background:${color(r)}` }), label])]),
      el('td', { className: 'sub', textContent: r.event ?? '—' }),
      el('td', { className: 'sub', textContent: r.head_branch ?? '—' }),
      el('td', { className: 'num sub', textContent: ago(r.created_at, now) }),
    ]));
  }
}

export async function loadRepo({ repo, token, onError }) {
  gh.resetCounters();
  const now = Date.now();

  const meta = await gh.getRepo(repo, token);
  const sha = await gh.getHeadSha(repo, meta.default_branch, token);

  const configText = await gh.getTextAtSha(repo, sha, '.claudinite-checks.json', token);
  if (!configText) onError?.(`${repo} has no .claudinite-checks.json — it does not run Claudinite, so there are no declared tasks.`);
  let declaration = null;
  try { declaration = configText ? JSON.parse(configText) : null; } catch {
    onError?.('.claudinite-checks.json is present but is not valid JSON — the roster will be empty.');
  }
  const schedule = declaration?.taskScheduler ?? null;
  if (declaration && !schedule) onError?.('No taskScheduler block — next-anchor times cannot be computed.');

  const [{ paths, truncated }, runs, issuePage] = await Promise.all([
    gh.listTreeAtSha(repo, sha, token),
    gh.listRuns(repo, token).catch((e) => { onError?.(`Actions unreadable — ${e.message}`); return []; }),
    gh.listIssues(repo, token),
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

  renderTiles(rows, open, runs, now);
  renderRoster(rows, repo, now, issuePage.complete);
  renderQueue(open, repo, now);
  renderRuns(runs, now);

  return { now, sha, branch: meta.default_branch, taskCount: tasks.length, itemCount: items.length, issuePage };
}
