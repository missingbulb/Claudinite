// The fleet overview: every member at once, worst first, with a way into any one of
// them. `fleet.mjs` decides what the rows MEAN; this file fetches and draws them.

import * as gh from './github.mjs';
import {
  summariseMember, rankMembers, rollUp, packSpread, taskSpread,
} from './fleet.mjs';
import { activitySeries, fleetBenefits, delta } from './activity.mjs';
import {
  $, el, ago, duration, groupedHead, columnCount, groupStarts, emptyRow, repoLink, tiles, segmentBar,
  reasonNodes, stackedColumns, chartLegend, windowFigure,
  LEVEL_GLYPH, STATE_ORDER, STATE_COLOR, STATE_UI, OUTCOME_COLOR,
} from './ui.mjs';
import { OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE } from '../../engine/scheduler/queue/work-item.mjs';

// Members are read concurrently, but not all at once: a dozen members at six calls
// each is enough parallel load to trip secondary rate limiting, and the page is not
// in a hurry. Small and steady beats a burst that gets throttled.
const CONCURRENCY = 4;

async function pool(items, worker, limit = CONCURRENCY) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next; next += 1;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

// One member's raw reads. Everything is wrapped: a member that 404s, times out or is
// rate-limited becomes a row that SAYS SO, because one unreadable repo must not blank
// the other eleven.
async function readMember(repo, token, { withTree = true } = {}) {
  try {
    const meta = await gh.getRepo(repo, token);
    // The head commit, kept whole: its date is when this member last landed anything,
    // and it arrives in the call the content cache already makes for the sha.
    const head = await gh.getHead(repo, meta.default_branch, token);
    const sha = head.sha;
    const configText = await gh.getTextAtSha(repo, sha, '.claudinite-checks.json', token);

    let declaration = null;
    if (configText) {
      try { declaration = JSON.parse(configText); } catch { declaration = null; }
    }

    // A member that does not run Claudinite needs no further reads — and skipping
    // them is most of the saving on a fleet where not everything is adopted.
    if (!declaration) return { repo, declaration: null, defaultBranch: meta.default_branch, head, stars: meta.stars };

    const [tree, issuePage, runs] = await Promise.all([
      withTree ? gh.listTreeAtSha(repo, sha, token).catch(() => null) : Promise.resolve(null),
      // One page is the whole live queue plus recent history, which is all a fleet row
      // needs. Deep history is the per-repo view's job.
      gh.listIssues(repo, token, { pages: 1 }).catch(() => ({ issues: [] })),
      gh.listRuns(repo, token, 30).catch(() => []),
    ]);

    return {
      repo,
      declaration,
      defaultBranch: meta.default_branch,
      stars: meta.stars,
      archived: meta.archived,
      sha,
      head,
      paths: tree?.paths ?? null,
      items: issuePage.issues,
      // Whether that page reached the end of this member's history. The activity
      // series needs it to tell a quiet day from a day it simply could not see.
      itemsComplete: issuePage.complete,
      prs: issuePage.prs ?? [],
      runs,
    };
  } catch (error) {
    return { repo, error };
  }
}

// The canon reference the mount column compares against. Optional by design: with no
// `canonRepo` configured the column reads `unknown` rather than inventing `current`,
// and no repo name is ever hardcoded in engine code.
async function readCanon(config, token) {
  if (!config?.canonRepo) return null;
  try {
    const meta = await gh.getRepo(config.canonRepo, token);
    const ref = await gh.getHeadSha(config.canonRepo, meta.default_branch, token);
    const text = await gh.getTextAtSha(config.canonRepo, ref, '.claudinite-checks.json', token);
    let engineVersion = null;
    try { engineVersion = JSON.parse(text ?? '{}')?.claudinite?.engineVersion ?? null; } catch { /* absent */ }
    return { repo: config.canonRepo, ref, engineVersion };
  } catch {
    return null;
  }
}

// --- render ---------------------------------------------------------------------

const MOUNT_UI = {
  current: { label: 'current', cls: 'ok' },
  behind: { label: 'behind', cls: 'info' },
  'behind-engine': { label: 'old engine', cls: 'serious' },
  stalled: { label: 'stalled', cls: 'warning' },
  none: { label: 'no stamp', cls: 'warning' },
  unknown: { label: '—', cls: 'idle' },
};

// The member grid, as three questions rather than one wall of columns:
//
//   STATUS      — what kind of repo is this, and is it alive.
//   CLAUDINITE  — what the machinery is doing here.
//   WORK        — what is waiting on a person.
//
// The identity pair at the left belongs to none of them: the name and the reason this
// row is where it is are how you read every other cell.
//
// Every column is derived from a read the page ALREADY makes. Four fields the issue
// asked for are absent for that reason and not by oversight — rule tokens, test counts
// and time saved would each need a member's own file read, and conversation-log
// sessions a branch listing. They are named in the panel's own note rather than
// guessed at.
const MEMBER_GROUPS = [
  ['', ['Member', 'Health']],
  ['Status', ['CI', 'Stars', 'Last commit']],
  ['Claudinite', ['Packs', 'Tasks', 'Queue', 'Recent outcomes', 'Mount', 'Scheduler']],
  ['Work — waiting on a person', ['Issues', 'Pull requests']],
];

// The same split, one level down: a task's identity, where it stands right now, and
// what it has done. `Parked` sits under Now because it is a live state, not a record.
const FLEET_TASK_GROUPS = [
  ['', ['Task']],
  ['Now', ['Members', 'Open', 'Parked']],
  ['History', ['Succeeded', 'No outcome']],
];

const MEMBER_COLS = columnCount(MEMBER_GROUPS);
const MEMBER_STARTS = groupStarts(MEMBER_GROUPS);

// The group's first cell carries the same rule the header band draws, so the three
// questions stay legible down the length of the table.
const banded = (cells) => cells.map((cell, i) => {
  if (MEMBER_STARTS.includes(i)) cell.classList.add('group-start');
  return cell;
});

const CI_UI = {
  passing: { label: 'passing', cls: 'ok' },
  failing: { label: 'failing', cls: 'critical' },
  running: { label: 'running', cls: 'info' },
  unknown: { label: '—', cls: 'info' },
};

function memberRow(s, onOpen, now) {
  const open = (e) => { e.preventDefault(); onOpen(s.repo); };

  const name = el('td', {}, [
    el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, className: 'name', textContent: s.repo.split('/')[1] ?? s.repo, onclick: open }),
    el('div', { className: 'sub' }, [repoLink(s.repo)]),
  ]);

  if (s.status !== 'adopted') {
    return el('tr', { className: `lvl-${s.level} muted-row` }, [
      name,
      el('td', { colSpan: MEMBER_COLS - 2 }, reasonNodes(s.reasons)),
      el('td', { className: 'nw' }, [el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, textContent: 'open', onclick: open })]),
    ]);
  }

  // Health: the worst reason, spelled out. Never a bare colour.
  const health = el('td', {}, s.reasons.length
    ? reasonNodes(s.reasons)
    : [el('span', { className: 'warn ok', textContent: `${LEVEL_GLYPH.ok} healthy` })]);

  // --- Status: the repo itself ---------------------------------------------------

  const ciUi = CI_UI[s.ci?.state] ?? CI_UI.unknown;
  const ci = el('td', { className: 'nw' }, [
    el('div', { className: `warn ${ciUi.cls}`, textContent: ciUi.label }),
    el('div', { className: 'sub', textContent: s.ci?.at ? ago(s.ci.at, now) : 'no run on the default branch' }),
  ]);

  const stars = el('td', { className: 'num nw', textContent: s.stars == null ? '—' : String(s.stars) });

  const commit = el('td', { className: 'nw sub', textContent: s.lastCommit ? ago(s.lastCommit, now) : '—' });

  // --- Claudinite: what the machinery is doing here -------------------------------

  const packs = el('td', { className: 'num nw' }, [
    el('div', { textContent: String(s.packs.length) }),
    el('div', { className: 'sub', textContent: 'declared' }),
  ]);

  const tasks = el('td', { className: 'num nw' }, [
    el('div', { textContent: s.declaredTasks == null ? '—' : String(s.declaredTasks) }),
    el('div', { className: 'sub', textContent: 'declared' }),
  ]);

  // Queue: the state mix as one thin bar plus the counts that are non-zero, so a
  // member with nothing open reads as empty rather than as a row of zeros.
  const counts = STATE_ORDER.filter((st) => s.open.byState[st] > 0)
    .map((st) => `${s.open.byState[st]} ${STATE_UI[st].label}`);
  const queue = el('td', {}, [
    segmentBar(STATE_ORDER.map((st) => [STATE_UI[st].label, s.open.byState[st], STATE_COLOR[st]]), { width: 92 }),
    el('div', { className: 'sub', textContent: counts.length ? counts.join(' · ') : 'nothing open' }),
  ]);

  const outcomes = el('td', {}, [
    segmentBar([
      ['done', s.outcomes[OUTCOME_DONE], OUTCOME_COLOR[OUTCOME_DONE]],
      ['delivered', s.outcomes[OUTCOME_DELIVERED], OUTCOME_COLOR[OUTCOME_DELIVERED]],
      ['obsolete', s.outcomes[OUTCOME_OBSOLETE], OUTCOME_COLOR[OUTCOME_OBSOLETE]],
      ['no outcome', s.outcomes.none, OUTCOME_COLOR.none],
    ], { width: 92 }),
    el('div', { className: 'sub', textContent: s.lastActivity ? ago(s.lastActivity, now) : (s.closedSeen ? 'unknown' : 'nothing closed yet') }),
  ]);

  const m = MOUNT_UI[s.mount.state] ?? MOUNT_UI.unknown;
  const mount = el('td', { className: 'nw' }, [
    el('div', { className: `warn ${m.cls}`, textContent: m.label }),
    el('div', { className: 'sub num', textContent: s.mount.ref ? s.mount.ref.slice(0, 7) : '—' }),
  ]);

  const runs = el('td', { className: 'nw' }, [
    el('div', {
      className: s.runs.consecutiveFailures ? 'warn critical' : 'sub',
      textContent: s.runs.consecutiveFailures
        ? `${LEVEL_GLYPH.critical} ${s.runs.consecutiveFailures} failing`
        : (s.runs.everRan ? 'passing' : 'never run'),
    }),
    el('div', { className: 'sub', textContent: s.runs.lastAt ? ago(s.runs.lastAt, now) : '—' }),
  ]);

  // --- Work: what is waiting on a person ------------------------------------------

  // Issues that are NOT queue items, and open pull requests. Both are inside the
  // issue page's window, so an old enough one is not counted — "in the window" is
  // said once under the table rather than in every cell.
  const issues = el('td', { className: 'num nw' }, [
    el('div', { textContent: String(s.work?.issues ?? 0) }),
    el('div', { className: 'sub', textContent: s.work?.issuesOldest ? `oldest ${duration(now - s.work.issuesOldest)}` : '—' }),
  ]);

  const prs = el('td', { className: 'num nw' }, [
    el('div', { textContent: String(s.work?.prs ?? 0) }),
    el('div', {
      className: 'sub',
      textContent: s.work?.prsOldest
        ? `oldest ${duration(now - s.work.prsOldest)}${s.work.drafts ? ` · ${s.work.drafts} draft` : ''}`
        : (s.work?.drafts ? `${s.work.drafts} draft` : '—'),
    }),
  ]);

  return el('tr', { className: `lvl-${s.level}` },
    banded([name, health, ci, stars, commit, packs, tasks, queue, outcomes, mount, runs, issues, prs]));
}

// --- what the machinery bought ---------------------------------------------------

// The block above everything else, and the only one that opens on what the machinery
// is FOR rather than on what is broken. Its content is decided in `activity.mjs`; the
// two rules that keep it honest are worth restating where it is drawn:
//
//   NO VANITY TOTAL. Every figure is this week's, against last week's. A number that
//   only ever grows is a decoration.
//
//   NOTHING INVENTED. No estimated hours saved, no multiplier, no score — only counts
//   of things that individually happened, from reads the page already made. Two
//   quantities the issue asked for are deliberately ABSENT rather than approximated:
//   checks enforced (a member's check count is not in any read this page makes) and
//   anything expressed in time saved (nothing measures it).
function renderBenefits(b) {
  const node = $('fleet-benefits');
  const runsPassed = b.current.runs - b.current.runsFailed;
  const prevPassed = b.previous.runs - b.previous.runsFailed;

  // `replaceChildren` renders a null child as the text "null", so the optional tile is
  // filtered out rather than passed through.
  node.replaceChildren(...[
    windowFigure(b.current.completed, 'work items completed',
      delta(b.current.completed, b.previous.completed),
      `in ${b.current.members} member(s)`),
    windowFigure(b.current.unattended, 'of those, closed with nobody in the loop',
      delta(b.current.unattended, b.previous.unattended),
      'not parked for a human when it closed'),
    windowFigure(b.current.parked, 'items that did need a person',
      delta(b.current.parked, b.previous.parked),
      'the honest other half of the figure above', { better: 'down' }),
    windowFigure(runsPassed, 'scheduler runs passed',
      delta(runsPassed, prevPassed),
      b.current.runsFailed ? `${b.current.runsFailed} failed` : 'none failed'),
    // No delta: a mount stamp carries ONE date, so last week's figure would count
    // members whose last converge happens to sit in that window, not members that
    // converged then. A comparison built on that would read as a fleet slowing down.
    windowFigure(`${b.converged}/${b.members}`, 'members converged on their own', null,
      `in the last ${b.windowDays} days`),
    b.digests === null ? null
      : windowFigure(b.digests, 'digests written', null, 'of the last two days'),
  ].filter(Boolean));
}

// --- the activity panel ----------------------------------------------------------

// The one panel that answers "what has this fleet been doing". Everything else here
// is fault-finding, and fault-finding cannot distinguish a good week from a dead one:
// healthy means every count is zero, and so does abandoned.
//
// Two charts rather than one, because the two series answer different questions and
// share no scale: work CLOSED is the fleet's output, runs are the machinery that
// produced it, and stacking them together would let a noisy scheduler read as
// productivity.
const WORK_SERIES = [
  { label: 'done', color: OUTCOME_COLOR[OUTCOME_DONE], value: (d) => d.work[OUTCOME_DONE] },
  { label: 'delivered', color: OUTCOME_COLOR[OUTCOME_DELIVERED], value: (d) => d.work[OUTCOME_DELIVERED] },
  { label: 'obsolete', color: OUTCOME_COLOR[OUTCOME_OBSOLETE], value: (d) => d.work[OUTCOME_OBSOLETE] },
  { label: 'no outcome', color: OUTCOME_COLOR.none, value: (d) => d.work.none },
  { label: 'other issues closed', color: 'var(--s-blue)', value: (d) => d.otherClosed },
];

const RUN_SERIES = [
  { label: 'runs passed', color: 'var(--good)', value: (d) => d.runs.success },
  { label: 'runs failed', color: 'var(--critical)', value: (d) => d.runs.failure },
  { label: 'runs other', color: 'var(--muted)', value: (d) => d.runs.other },
];

function renderActivity(series) {
  const charts = $('fleet-activity');
  const pass = series.totals.runs
    ? Math.round(((series.totals.runs - series.totals.runsFailed) / series.totals.runs) * 100)
    : null;

  // Which members moved AT ALL. A fleet where two of twelve did anything is a fact
  // about the fleet, and it is invisible in any per-member row.
  const movement = el('div', { className: 'movement' }, [
    el('div', { className: 'v num', textContent: `${series.moved.length}/${series.members}` }),
    el('div', { className: 'k', textContent: 'members moved in the window' }),
    el('div', { className: 'sub', textContent: series.quiet.length ? `quiet: ${series.quiet.map((r) => r.split('/')[1] ?? r).join(', ')}` : 'every readable member did something' }),
    series.unread ? el('div', { className: 'sub', textContent: `${series.unread} member(s) unread — not counted either way` }) : null,
  ]);

  charts.replaceChildren(
    el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: `${series.totals.workClosed} work items closed · ${series.totals.otherClosed} other issues` }),
      chartLegend(WORK_SERIES),
      stackedColumns(series.days, WORK_SERIES),
      // A window that reaches past what one issue page holds is a floor, not a count,
      // and a chart that does not say so reads as a fleet that went quiet.
      series.horizon.issues
        ? el('div', { className: 'sub', textContent: `before ${series.horizon.issues} this is a floor — one issue page per member does not reach further back` })
        : null,
    ]),
    el('div', { className: 'chart-card' }, [
      el('div', { className: 'k', textContent: pass == null ? 'no scheduler runs in the window' : `${series.totals.runs} runs · ${pass}% passed` }),
      chartLegend(RUN_SERIES),
      stackedColumns(series.days, RUN_SERIES),
      series.horizon.runs
        ? el('div', { className: 'sub', textContent: `before ${series.horizon.runs} this is a floor — the last 30 runs per member do not reach further back` })
        : null,
    ]),
    el('div', { className: 'chart-card' }, [movement]),
  );
}

// A member whose read has not landed yet. It is a row from the first paint rather
// than a gap that fills in, because a fleet page that appears all at once at the end
// looks broken for the whole sweep — and on a slow or throttled read, the sweep is
// most of the time the viewer spends here.
const pendingRow = (repo) => el('tr', { className: 'pending-row' }, [
  el('td', {}, [
    el('span', { className: 'name', textContent: repo.split('/')[1] ?? repo }),
    el('div', { className: 'sub' }, [repoLink(repo)]),
  ]),
  el('td', { colSpan: MEMBER_COLS - 1 }, [el('span', { className: 'sub', textContent: 'reading…' })]),
]);

function renderFleet(summaries, reads, now, onOpen, canon, progress = null, digests = null) {
  const resolved = summaries.filter(Boolean);
  const pending = summaries.map((s, i) => (s ? null : reads.names?.[i])).filter(Boolean);
  const roll = rollUp(resolved);

  tiles($('fleet-tiles'), [
    [roll.needAttention, 'members need you', roll.needAttention ? 'var(--critical)' : null,
      roll.needAttention ? 'parked, failing, or past a leash' : 'nothing is on fire'],
    [roll.parkedItems, 'items parked', roll.parkedItems ? 'var(--critical)' : null,
      roll.parkedMembers ? `across ${roll.parkedMembers} member(s)` : ''],
    [roll.failingMembers, 'schedulers failing', roll.failingMembers ? 'var(--critical)' : null,
      roll.neverRan ? `${roll.neverRan} never ran` : ''],
    [roll.behindMembers, 'mounts behind', roll.behindMembers ? 'var(--serious)' : null,
      canon ? `canon ${canon.ref.slice(0, 7)}` : 'no canon configured'],
    [roll.openItems, 'open work items', null, `${roll.inFlight} run(s) in flight`],
    [`${roll.adopted}/${roll.members}`, 'members adopted', null,
      [roll.notAdopted ? `${roll.notAdopted} not adopted` : '', roll.unreadable ? `${roll.unreadable} unreadable` : ''].filter(Boolean).join(', ')],
  ]);

  // Every number above is a number about the members READ SO FAR, and a partial
  // rollup that does not say so is a wrong one. The count is stated rather than the
  // page waiting to be sure.
  $('fleet-progress').textContent = progress && progress.done < progress.total
    ? `${progress.done}/${progress.total} repos read — figures below cover those`
    : (progress ? `${progress.total} repos read` : '');

  const body = groupedHead($('fleet'), MEMBER_GROUPS);
  if (!summaries.length) { body.append(emptyRow(MEMBER_COLS, 'No members in the roster.')); return; }
  for (const s of rankMembers(resolved)) body.append(memberRow(s, onOpen, now));
  for (const repo of pending) body.append(pendingRow(repo));

  // Tasks across the fleet. This is the view a per-repo page structurally cannot
  // give: a shared pack's task parked in four members at once is a canon problem,
  // and in any single repo it looks like that repo's bad luck.
  const resolvedReads = reads.filter(Boolean);
  renderBenefits(fleetBenefits(resolvedReads, { now, digests }));
  renderActivity(activitySeries(resolvedReads, { now }));

  const spread = taskSpread(resolvedReads, now).filter((t) => t.members > 0);
  const tbody = groupedHead($('fleet-tasks'), FLEET_TASK_GROUPS);
  if (!spread.length) tbody.append(emptyRow(columnCount(FLEET_TASK_GROUPS), 'No work items seen across the fleet.'));
  for (const t of spread.slice(0, 25)) {
    tbody.append(el('tr', { className: t.parked ? 'lvl-critical' : '' }, [
      el('td', {}, [
        el('div', { className: 'name', textContent: t.task }),
        el('div', { className: 'sub', textContent: t.pack }),
      ]),
      el('td', { className: 'num', textContent: String(t.members) }),
      el('td', { className: 'num', textContent: String(t.open) }),
      el('td', {}, t.parked
        ? [el('span', { className: 'warn critical', textContent: `${LEVEL_GLYPH.critical} ${t.parked}` })]
        : [el('span', { className: 'sub', textContent: '0' })]),
      el('td', { className: 'num', textContent: String(t.done) }),
      el('td', {}, t.failed
        ? [el('span', { className: 'warn serious', textContent: `${LEVEL_GLYPH.serious} ${t.failed}` })]
        : [el('span', { className: 'sub', textContent: '0' })]),
    ]));
  }

  const packs = packSpread(resolved);
  $('fleet-packs').replaceChildren(...packs.map((p) =>
    el('span', { className: 'chip', title: `${p.members} member(s)` }, [
      p.pack, el('b', { className: 'count', textContent: String(p.members) }),
    ])));
}

// --- entry ----------------------------------------------------------------------

export async function loadFleet({ repos, token, config, onOpen, onError, onProgress }) {
  gh.resetCounters();
  const now = Date.now();

  const canon = await readCanon(config, token);

  // Rendered on every arrival rather than once at the end: the page is useful from
  // the first member back, and the member a viewer opened it for may be the first.
  const reads = new Array(repos.length).fill(null);
  reads.names = repos;
  const summaries = new Array(repos.length).fill(null);
  let done = 0;
  const paint = () => renderFleet(summaries, reads, now, onOpen, canon, { done, total: repos.length });
  paint();

  await pool(repos, async (repo, i) => {
    const r = await readMember(repo, token);
    reads[i] = r;
    summaries[i] = summariseMember(r, { now, canon });
    done += 1;
    onProgress?.(done, repos.length, repo);
    paint();
    return r;
  });
  const failed = summaries.filter((s) => s?.status === 'unreadable');
  // Surfaced once at the top rather than as twelve separate errors: on a fleet, some
  // members being invisible to you is the normal case, not an incident.
  if (failed.length === repos.length && repos.length > 0) {
    onError?.(`None of the ${repos.length} members could be read — check that you are signed in with an account that can see them.`);
  }

  paint();
  return { summaries: summaries.filter(Boolean), now, canon };
}
