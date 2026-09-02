// The fleet overview: every member at once, worst first, with a way into any one of
// them. `fleet.mjs` decides what the rows MEAN; this file fetches and draws them.

import * as gh from './github.mjs';
import {
  summariseMember, rankMembers, rollUp, packSpread, taskSpread, attentionBreakdown,
  memberAttention, fleetAttention, estimateMinutes, estimateNote, parkMinutes, parkMinutesNote,
} from './fleet.mjs';
import { readCanon, priceStampedPacks } from './canon.mjs';
import { activitySeries, delta, commitDays } from './activity.mjs';
import { readUsage } from './usage.mjs';
import {
  readContributions, liveSourcesNeeded, readDeploymentContributions, valueOf, fleetPhrase, phraseText,
} from './contributions.mjs';
import { miniCard, miniAbsent, packCard, CONTRIB_STATE_TEXT } from './contrib-view.mjs';
import { fleetCorpus } from './fleet-growth.mjs';
import { fleetCandidates } from './next-work.mjs';
import {
  $, el, ago, duration, groupedHead, columnCount, groupStarts, emptyRow, leadCard, repoLink, tiles, segmentBar,
  reasonNodes, stackedColumns, chartLegend, windowFigure, ciMark, commitGraph, packMark,
  LEVEL_GLYPH, STATE_ORDER, STATE_COLOR, STATE_UI, OUTCOME_COLOR,
} from './ui.mjs';
import { band, slip, machineCell, beats, wakeTicks, figureRow, pulseChart, detailTable, expander } from './sheet.mjs';
import { fleetLedger, machinePanel, fmtTokens, fmtHours, fmtAge, STUCK_DAYS } from './fleet-ledger.mjs';
import { wakeStrip } from './model.mjs';
import { settingsTextAtSha } from './settings-read.mjs';
import { sweepPhases } from './fleet-sweep.mjs';

// --- the passes ------------------------------------------------------------------
//
// One member's reads, split into the passes `fleet-sweep.mjs` takes the whole roster
// through in turn. The split is by WHAT THE READ BUYS, worth-most first, because that
// is the order the viewer's rate limit is spent in:
//
//   identity      what this repo is and whether it runs Claudinite at all
//   attention     the queue and the scheduler — every reason a row is ever raised
//   depth         the tree and the member's own usage fold, behind those numbers
//   packs         what the member's own packs report about themselves
//   activity      the commit graph, which is decoration and says so
//
// Everything is wrapped: a member that 404s, times out or is rate-limited becomes a
// row that SAYS SO, because one unreadable repo must not blank the other eleven.

// Pass one. Three calls, and for a repo that does not run Claudinite they are the
// only three it ever costs — which is most of the saving on a fleet where not
// everything is adopted.
async function readIdentity(repo, token) {
  try {
    const meta = await gh.getRepo(repo, token);
    // The head commit, kept whole: its date is when this member last landed anything,
    // and it arrives in the call the content cache already makes for the sha.
    const head = await gh.getHead(repo, meta.default_branch, token);
    const sha = head.sha;
    const configText = await settingsTextAtSha(gh, repo, sha, token);

    let declaration = null;
    if (configText) {
      try { declaration = JSON.parse(configText); } catch { declaration = null; }
    }

    return {
      repo,
      declaration,
      defaultBranch: meta.default_branch,
      stars: meta.stars,
      archived: meta.archived,
      sha,
      head,
    };
  } catch (error) {
    return { repo, error };
  }
}

// Pass two, and the one the page exists for: every fault a row can report — a parked
// item, a blown leash, a failing scheduler — is read here. Once this pass is through
// the roster the lead card, the tiles and the ranking are true of the WHOLE fleet,
// which is why nothing below it is allowed to start first.
async function readAttention(read, token) {
  const [issuePage, runs] = await Promise.all([
    // One page is the whole live queue plus recent history, which is all a fleet row
    // needs. Deep history is the per-repo view's job.
    gh.listIssues(read.repo, token, { pages: 1 }).catch(() => ({ issues: [] })),
    // No per-page of its own: the repo view reads the same URL, and a different
    // depth here would be a second cache entry for one question.
    gh.listRuns(read.repo, token).catch(() => []),
  ]);
  read.items = issuePage.issues;
  // Whether that page reached the end of this member's history. The activity series
  // needs it to tell a quiet day from a day it simply could not see.
  read.itemsComplete = issuePage.complete;
  read.prs = issuePage.prs ?? [];
  read.runs = runs;
}

// Pass three: what stands behind the numbers rather than what they are. The tree says
// how many tasks this member declares — the difference between "quiet" and "declares
// five tasks and has never produced a work item" — and the usage fold is the member's
// own past-data plane, keyed by its head sha, so it is one read the first time a
// member's branch moves and none afterwards.
async function readDepth(read, token) {
  const [tree, usage] = await Promise.all([
    gh.listTreeAtSha(read.repo, read.sha, token).catch(() => null),
    readUsage(read.repo, read.sha, token),
  ]);
  read.paths = tree?.paths ?? null;
  read.usage = usage;
}

// Pass four: what this member's own packs report. Discovery is a match against the
// tree listing pass three fetched, so a member whose packs contribute nothing costs
// nothing to find that out; the descriptor and values reads are content at a sha and
// free on every load after the branch moves.
async function readPackCards(read, token) {
  const contributions = await readContributions({
    repo: read.repo, sha: read.sha, token, declaration: read.declaration, paths: read.paths ?? null, gh,
  });
  const needed = liveSourcesNeeded(contributions);
  const live = {
    stars: read.stars,
    // The one live read pack contributions add, and only when some declared pack
    // actually asks for it — a fleet with no release pack never spends it.
    release: needed.has('latest-release')
      ? await gh.latestRelease(read.repo, token).catch(() => undefined)
      : undefined,
  };
  for (const c of contributions) c.live = live;
  read.contributions = contributions;
  read.live = live;
}

// Pass five, and decoration by its own admission: it says how busy a repo has been.
// It withholds itself when the budget is tight, and a failure is a row without a
// graph rather than a row that could not be read. Last, because a graph missing from
// every row costs the page nothing it was opened for.
async function readCommitGraph(read, token) {
  read.commits = await gh.commitActivity(read.repo, token).catch(() => null);
}

// --- render ---------------------------------------------------------------------

// The member grid, as three questions rather than one wall of columns:
//
//   ACTIVITY    — is anyone working on this repo.
//   WAITING     — what is on a person's plate here, and roughly how long it is.
//   CLAUDINITE  — what the machinery is doing.
//
// They are in that order because it is the order a reader asks them in: a repo nobody
// touches and a repo with a queue behind it are different problems, and what the
// scheduler is doing only matters once you know which one you are looking at.
//
// The identity pair at the left belongs to none of them. Stars, CI and the name are
// how you recognise the row; the reasons beside them are why it is where it is.
//
// Every column but one is derived from a read the page ALREADY makes. Four fields the
// issue asked for are absent for that reason and not by oversight — rule tokens, test
// counts and time saved would each need a member's own file read, and conversation-log
// sessions a branch listing. They are named in the panel's own note rather than
// guessed at. The exception is the commit graph, which is priced as decoration.
//
// `Tasks — declared` is gone, and that one WAS a read the page makes: it is the whole
// reason each member's tree is fetched. The count answered "how much is wired up
// here", which the pack count answers more directly and without a number that means
// nothing until you know which packs. The tree is still read — "declares tasks and has
// never produced a work item" is a finding only it can make.
const MEMBER_GROUPS = [
  ['', ['Member']],
  ['Activity', ['Commits']],
  ['Waiting on a person', ['Est.', 'What it is', 'Issues', 'Pull requests']],
  ['Claudinite', ['Packs', 'Queue', 'Recent outcomes', 'Scheduler']],
];

// The same split, one level down: a task's identity, where it stands right now, and
// what it has done. `Parked` sits under Now because it is a live state, not a record.
const FLEET_TASK_GROUPS = [
  ['', ['Task']],
  ['Now', ['Members', 'Open', 'Parked']],
  ['History', ['Succeeded', 'No outcome']],
];

// Reason kinds the row already SHOWS somewhere of their own — parks in the Waiting
// group with an estimate beside them, the mount as a badge on the pack count, CI as a
// dot by the name. Spelling those out again in prose was the same fact twice and, at
// 180px of sentences, the column that decided how wide the whole grid was.
//
// What is left is rare and has no cell: "declares no packs", and a scheduler fault
// the runs column reports as a state but not as a sentence. So it goes UNDER THE NAME
// when there is any, and costs nothing on the rows — nearly all of them — where there
// is not. The ranking is untouched: `summariseMember` still weighs every reason, and
// only the rendering filters, so a member at the top for a park still shows its park
// one cell to the right.
//
// Kept beside the group list, because the two move together: folding a signal into a
// mark is what puts its kind in here.
const SHOWN_ELSEWHERE = new Set(['park', 'mount', 'ci']);

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

// THE SUBROW: what this member's packs report, one mini-card each, spanning the grid.
//
// A row rather than a fourth column group, and that is what makes the rule above it
// affordable: a column held two cards and forced an overflow marker, where a grid
// width holds six and every card a member has can simply render. SHOWN OR ABSENT —
// there is no `+n` here, and no card whose content is that some pack has something to
// say.
//
// A pack with no `fleet.member` in its descriptor contributes to the repo page only
// and is silent here; a member with nothing to report gets no subrow at all.
function contribRow(s, now) {
  const cards = [];
  for (const c of s.contributions ?? []) {
    if (c.withheld) { cards.push(miniAbsent('not read', `${c.pack} — the page declined to spend a request`)); continue; }
    const id = c.descriptor?.member;
    if (!id) continue;
    const widget = c.descriptor.widgets.get(id);
    const title = `${c.pack} · ${widget.label}`;
    const resolved = valueOf(widget, { values: c.values, live: c.live ?? s.live ?? {} });
    if (resolved.state !== 'ok') { cards.push(miniAbsent(CONTRIB_STATE_TEXT[resolved.state] ?? 'not read', title)); continue; }
    const parts = fleetPhrase(widget, resolved.value, now);
    if (!parts?.length) { cards.push(miniAbsent(CONTRIB_STATE_TEXT.absent, title)); continue; }
    cards.push(miniCard(parts, { title: `${title} — ${phraseText(parts)}`, glyph: widget.glyph }));
  }
  if (!cards.length) return null;
  // The severity class rides on the subrow too, so the edge runs the height of the
  // member rather than stopping halfway down it.
  return el('tr', { className: `contrib lvl-${s.level}` }, [
    el('td', { className: 'contrib-cell', colSpan: MEMBER_COLS }, [el('div', { className: 'minis' }, cards)]),
  ]);
}

// One member, as the rows of its own `<tbody>`: the standard metrics, then the subrow
// when it has one. They are one member and not two rows — which is what the grouping
// buys, since a `<tbody>` is what lets both highlight together on hover.
function memberRows(s, onOpen, now) {
  const open = (e) => { e.preventDefault(); onOpen(s.repo); };

  // ONE mark ahead of the name now, not two: CI, whether it builds, read as part of
  // identifying the row rather than as a finding.
  //
  // Stars used to sit here, drawn by this file. It is `git-github`'s contribution
  // instead — a descriptor and no code — and it lands in the subrow below with every
  // other thing a pack has to say. The cost is deliberate and visible: a member that
  // does not declare `git-github` has no star count anywhere, because a fact the page
  // happens to hold is not a reason to render it.
  const ciUi = CI_UI[s.ci?.state] ?? CI_UI.unknown;
  const identity = (kids) => el('td', { className: 'member-cell' }, [el('div', { className: 'member' }, [
    ciMark(ciUi, s.ci?.at ? duration(now - s.ci.at) : 'no run'),
    el('div', {}, [
      el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, className: 'name', textContent: s.repo.split('/')[1] ?? s.repo, onclick: open }),
      el('div', { className: 'sub' }, [repoLink(s.repo)]),
      ...kids,
    ]),
  ])]);
  const name = identity([]);

  if (s.status !== 'adopted') {
    return [el('tr', { className: `std lvl-${s.level} muted-row` }, [
      name,
      el('td', { colSpan: MEMBER_COLS - 2 }, reasonNodes(s.reasons)),   // the last cell is the open link
      el('td', { className: 'nw' }, [el('a', { href: `?repo=${encodeURIComponent(s.repo)}`, textContent: 'open', onclick: open })]),
    ])];
  }

  // Whatever is left once every reason with a cell of its own is dropped — see
  // SHOWN_ELSEWHERE. Usually nothing, and then the name cell is the plain one.
  const spoken = s.reasons.filter((r) => !SHOWN_ELSEWHERE.has(r.kind));
  const identified = spoken.length ? identity(reasonNodes(spoken)) : name;

  // --- Activity: is this repo being worked on ------------------------------------

  // Where a single "3h ago" used to sit. One date says whether a repo moved today; a
  // quarter of them, as a shape, says whether it is being worked on — which is the
  // question the group is actually asking, and the reason it is no longer called
  // "Status".
  const commit = el('td', { className: 'nw' }, [
    commitGraph(s.commits, { note: s.lastCommit ? `last ${duration(now - s.lastCommit)}` : null }),
  ]);

  // --- Waiting on a person -------------------------------------------------------

  // The estimate, and immediately beside it what the estimate is made of. A number
  // with no breakdown is a number nobody can check; a breakdown with no total is a
  // list nobody can prioritise between rows.
  const attention = memberAttention(s);
  const minutes = estimateMinutes(attention);
  const est = el('td', { className: 'num nw' }, [
    el('div', { className: 'est num', textContent: minutes ? String(minutes) : '—' }),
    el('div', { className: 'sub', textContent: minutes ? 'min' : '' }),
  ]);

  const needs = attentionBreakdown(attention);
  const what = el('td', {}, needs.length
    ? [el('div', { className: 'needs' }, needs.map((r) =>
      el('div', { className: `warn ${r.level}`, textContent: `${LEVEL_GLYPH[r.level]} ${r.text}` })))]
    : [el('span', { className: 'sub', textContent: 'nothing waiting' })]);

  // --- Claudinite: what the machinery is doing here -------------------------------

  // How much Claudinite is declared here, wearing whether it is current. Two facts
  // read together, and the second is a scheduler run on nearly every row — so it earns a
  // corner of the first rather than a column beside it, with the versions on hover.
  const packs = el('td', { className: 'nw' }, [packMark(s.packs.length, s.mount)]);

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
      ['done', s.outcomes.done, OUTCOME_COLOR.done],
      ['delivered', s.outcomes.delivered, OUTCOME_COLOR.delivered],
      ['obsolete', s.outcomes.obsolete, OUTCOME_COLOR.obsolete],
      ['no outcome', s.outcomes.none, OUTCOME_COLOR.none],
    ], { width: 92 }),
    el('div', { className: 'sub', textContent: s.lastActivity ? ago(s.lastActivity, now) : (s.closedSeen ? 'unknown' : 'nothing closed yet') }),
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

  return [
    el('tr', { className: `std lvl-${s.level}` },
      banded([identified, commit, est, what, issues, prs, packs, queue, outcomes, runs])),
    contribRow(s, now),
  ].filter(Boolean);
}

// The deployment's own cards — the fleet questions no single member's page can
// answer. Rendered from the packs the deployment repo (and the canon, when one is
// configured) declares, and absent entirely when neither contributes any.
function renderDeployment(contributions, now) {
  const section = $('fleet-contrib');
  if (!section) return;
  if (!contributions?.length) { section.hidden = true; return; }
  section.hidden = false;
  $('fleet-contrib-cards').replaceChildren(
    ...contributions.map((c) => packCard(c, now, { ids: c.descriptor.deployment })));
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
//   of things that individually happened, from reads the page already made. Three
//   quantities the issue asked for are deliberately ABSENT rather than approximated:
//   checks enforced (a member's check count is not in any read this page makes),
//   anything expressed in time saved (nothing measures it), and members converged in
//   the window — a member's settings say WHAT it holds, never when it took it, since
//   #1252 deleted the datetime the tile used to count (which recorded the last full
//   re-vendor, not the last converge, and so counted the wrong thing anyway).
// --- what the corpus is doing, in detail -------------------------------------------

// The section the benefits block only headlines. Everything here is derived from the
// usage folds the depth pass already read — no request — and it answers the questions
// a single member's page structurally cannot: which check scope is doing the catching,
// which rules earn their keep fleet-wide, and which skills are mounted in ten repos and
// have never loaded in any of them.
//
// Two ranges, said on the panel: the workload tiles are this week against last, like
// the block above; the tables are the whole folded range, because "never loaded" over
// seven days is not a finding.

const fmt = (n) => (n === null || n === undefined ? '—' : String(n));
const pct = (r) => (r === null ? '—' : `${Math.round(r * 1000) / 10}%`);

// A relative-volume bar: a length against the table's own maximum, so the column reads
// as a shape rather than as a number to compare by eye.
const volume = (n, max, cls) => el('div', { className: 'vol' }, [
  el('i', { className: cls, style: `width:${max ? Math.max(2, Math.round((n / max) * 100)) : 0}%` }),
]);

function workloadTiles(c) {
  const node = $('fleet-workload');
  const { current, previous } = c.workload;
  const change = (f) => (previous[f] === null || current[f] === null ? null : delta(current[f], previous[f]));
  node.replaceChildren(
    windowFigure(fmt(current.sessions), 'sessions', change('sessions'), `in ${c.folding} folding member(s)`),
    windowFigure(fmt(current.captures), 'captures', change('captures'), current.merges === null ? 'merges not recorded' : `${current.merges} merged`),
    windowFigure(fmt(current.userMessages), 'human turns', change('userMessages'),
      current.sessions && current.userMessages !== null ? `${Math.round((current.userMessages / current.sessions) * 10) / 10} per session` : ''),
    windowFigure(fmt(current.userCommands), 'slash commands', change('userCommands'),
      current.userMessages && current.userCommands !== null ? `${Math.round((current.userCommands / current.userMessages) * 100)}% of turns` : ''),
  );
}

const SCOPE_TEXT = {
  work: { title: 'work', sub: 'Stop hook, per turn' },
  world: { title: 'world', sub: 'full sweep, wired into tests' },
};

function scopeCard(name, s) {
  const text = SCOPE_TEXT[name];
  if (!s.seen) {
    return el('div', { className: 'chart-card scope' }, [
      el('div', { className: 'k' }, [el('b', { textContent: text.title }), ` · ${text.sub}`]),
      el('div', { className: 'sub', textContent: 'no member recorded this scope in the range' }),
    ]);
  }
  const rows = [
    ['runs', s.runs], ['runs that caught something', s.failures], ['blocking reported', s.blocking],
    ['advisory reported', s.advisory], ['of which CI runs / caught', `${s.ciRuns} / ${s.ciFailures}`], ['runner errors', s.errors],
  ];
  return el('div', { className: 'chart-card scope' }, [
    el('div', { className: 'k' }, [el('b', { textContent: text.title }), ` · ${text.sub}`]),
    el('dl', {}, rows.flatMap(([k, v]) => [
      el('dt', { textContent: k }),
      el('dd', { className: `num${k === 'runner errors' && s.errors ? ' warn critical' : ''}`, textContent: String(v) }),
    ])),
    el('div', { className: 'rate' }, [
      el('span', { className: 'big num', textContent: pct(s.catchRate) }),
      el('span', { className: 'sub', textContent: 'of runs caught something blocking' }),
    ]),
    el('div', { className: 'meter' }, [el('i', { style: `width:${Math.round((s.catchRate ?? 0) * 100)}%` })]),
  ]);
}

function rulesTable(c) {
  const tbody = groupedHead($('fleet-rules'), [['', ['Rule']], ['Findings', ['Blocking', 'Advisory', 'Members', 'Relative volume']]]);
  if (!c.rules.length) { tbody.append(emptyRow(5, 'No check reported a finding in the range.')); return; }
  const max = c.rules[0].total;
  const shown = c.rules.slice(0, 15);
  const rest = c.rules.slice(15);
  for (const r of shown) {
    tbody.append(el('tr', {}, [
      el('td', { className: 'name nw', textContent: r.rule }),
      el('td', { className: `num${r.blocking ? '' : ' dim'}`, textContent: String(r.blocking) }),
      el('td', { className: `num${r.advisory ? '' : ' dim'}`, textContent: String(r.advisory) }),
      el('td', { className: 'num', textContent: String(r.members) }),
      el('td', { className: 'volcell' }, [volume(r.total, max, r.blocking >= r.advisory ? 'block' : 'advise')]),
    ]));
  }
  if (rest.length) {
    const b = rest.reduce((n, r) => n + r.blocking, 0);
    const a = rest.reduce((n, r) => n + r.advisory, 0);
    tbody.append(el('tr', {}, [
      el('td', { className: 'name dim', textContent: `${rest.length} further rule(s)` }),
      el('td', { className: 'num', textContent: String(b) }),
      el('td', { className: 'num', textContent: String(a) }),
      el('td', { className: 'num dim', textContent: '' }),
      el('td', { className: 'volcell' }, [volume(a + b, max, 'block')]),
    ]));
  }
}

function skillsCards(c) {
  const node = $('fleet-skills');
  const { loaded, neverLoaded, treesRead } = c.skills;
  const total = loaded.reduce((n, s) => n + s.loads, 0);
  const max = loaded[0]?.loads ?? 0;
  const top = loaded.slice(0, 8);
  const rest = loaded.slice(8);

  const loadedCard = el('div', { className: 'chart-card' }, [
    el('div', { className: 'k' }, [el('b', { textContent: 'Loaded at least once' })]),
    el('div', {
      className: 'sub',
      textContent: loaded.length
        ? `${total} load(s) across ${loaded.length} distinct skill(s)${max ? ` — ${loaded[0].skill} is ${Math.round((max / total) * 100)}% of them` : ''}`
        : 'no skill load recorded in the range',
    }),
    loaded.length ? el('table', { className: 'plain' }, [el('tbody', {}, [
      ...top.map((s) => el('tr', { title: `${s.skill}: ${s.loads} load(s) in ${s.members} member(s)${s.mountedIn === null ? '' : `, mounted in ${s.mountedIn}`}` }, [
        el('td', { className: 'name nw', textContent: s.skill }),
        el('td', { className: 'num', textContent: String(s.loads) }),
        el('td', { className: 'num dim nw', textContent: s.mountedIn === null ? `${s.members} repo(s)` : `${s.members}/${s.mountedIn} repos` }),
        el('td', { className: 'volcell' }, [volume(s.loads, max, 'skill')]),
      ])),
      rest.length ? el('tr', {}, [
        el('td', { className: 'name dim', textContent: `${rest.length} more` }),
        el('td', { className: 'num', textContent: String(rest.reduce((n, s) => n + s.loads, 0)) }),
        el('td', {}), el('td', { className: 'volcell' }, [volume(rest.reduce((n, s) => n + s.loads, 0), max, 'skill')]),
      ]) : null,
    ].filter(Boolean))]) : null,
  ].filter(Boolean));

  const neverCard = el('div', { className: 'chart-card' }, [
    el('div', { className: 'k' }, [el('b', { textContent: 'Mounted, never loaded' })]),
    el('div', {
      className: 'sub',
      textContent: treesRead
        ? `${neverLoaded.length} of ${c.skills.mountedDistinct} mounted skill(s) recorded zero loads, across ${treesRead} member tree(s) read`
        : 'no member tree was read, so what is mounted is unknown here',
    }),
    neverLoaded.length ? el('ul', { className: 'zero' }, neverLoaded.slice(0, 14).map((s) =>
      el('li', {}, [el('span', { className: 'name', textContent: s.skill }), el('span', { className: 'dim', textContent: `${s.mountedIn} repo(s)` })]))) : null,
    neverLoaded.length > 14 ? el('div', { className: 'sub', textContent: `and ${neverLoaded.length - 14} more` }) : null,
  ].filter(Boolean));

  node.replaceChildren(loadedCard, neverCard);
}

const CORPUS_MEMBER_GROUPS = [
  ['', ['Member']],
  ['Sessions', ['Sessions', 'Turns', 'Skill loads', 'Rule tokens / session']],
  ['Checks', ['work runs / caught', 'world runs / caught', 'Findings']],
  ['Fold', ['Through']],
];

function corpusMembers(c, onOpen) {
  const tbody = groupedHead($('fleet-corpus-members'), CORPUS_MEMBER_GROUPS);
  const cols = columnCount(CORPUS_MEMBER_GROUPS);
  if (!c.members.length) { tbody.append(emptyRow(cols, 'No readable member.')); return; }
  const starts = groupStarts(CORPUS_MEMBER_GROUPS);
  const band = (cells) => cells.map((cell, i) => { if (starts.includes(i)) cell.classList.add('group-start'); return cell; });
  for (const m of c.members) {
    const open = (e) => { e.preventDefault(); onOpen(m.repo); };
    const name = el('td', { className: 'nw' }, [
      el('a', { href: `?repo=${encodeURIComponent(m.repo)}`, className: 'name', textContent: m.repo.split('/')[1] ?? m.repo, onclick: open }),
    ]);
    if (!m.folding) {
      tbody.append(el('tr', { className: 'muted-row' }, [name, el('td', { colSpan: cols - 1, className: 'sub', textContent: 'no usage file — not folding, so counted in none of the figures above' })]));
      continue;
    }
    const scope = (s) => el('td', { className: 'num nw', textContent: `${s.runs} / ${s.failures}${s.errors ? ` · ${s.errors} err` : ''}` });
    const findings = el('td', { className: 'nw' }, [
      m.blocking ? el('span', { className: 'chip block', textContent: `${m.blocking} B` }) : null,
      m.blocking && m.advisory ? ' ' : null,
      m.advisory ? el('span', { className: 'chip advise', textContent: `${m.advisory} A` }) : null,
      !m.blocking && !m.advisory ? el('span', { className: 'dim', textContent: '0' }) : null,
    ].filter(Boolean));
    tbody.append(el('tr', {}, band([
      name,
      el('td', { className: 'num', textContent: fmt(m.sessions) }),
      el('td', { className: 'num', textContent: fmt(m.turns) }),
      el('td', { className: 'num', textContent: fmt(m.skillLoads) }),
      el('td', { className: 'num', textContent: fmt(m.tokensPerSession) }),
      scope(m.work), scope(m.world), findings,
      el('td', { className: 'dim nw', textContent: m.foldedThrough ?? 'not stated' }),
    ])));
  }
}

function renderCorpus(c, onOpen) {
  const section = $('fleet-corpus');
  if (!c.readable) { section.hidden = true; return; }
  section.hidden = false;
  $('fleet-corpus-range').textContent = c.folding
    ? `${c.from} to ${c.to} — ${c.folding}/${c.readable} member(s) fold a usage file${c.absent.length ? `; not folding: ${c.absent.map((r) => r.split('/')[1] ?? r).join(', ')}` : ''}`
    : 'no member folds a usage file yet — everything below waits on the claudinite-growth pack’s usage-fold task';
  workloadTiles(c);
  $('fleet-scopes').replaceChildren(scopeCard('work', c.scopes.work), scopeCard('world', c.scopes.world));
  $('fleet-rules-note').textContent = c.rules.length
    ? `${c.findings.blocking + c.findings.advisory} finding(s) across ${c.rules.length} rule(s) — ${c.findings.blocking} blocking, ${c.findings.advisory} advisory`
    : '';
  rulesTable(c);
  skillsCards(c);
  corpusMembers(c, onOpen);
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
  { label: 'done', color: OUTCOME_COLOR.done, value: (d) => d.work.done },
  { label: 'delivered', color: OUTCOME_COLOR.delivered, value: (d) => d.work.delivered },
  { label: 'obsolete', color: OUTCOME_COLOR.obsolete, value: (d) => d.work.obsolete },
  { label: 'no outcome', color: OUTCOME_COLOR.none, value: (d) => d.work.none },
  { label: 'other issues closed', color: 'var(--s-blue)', value: (d) => d.otherClosed },
];

const RUN_SERIES = [
  { label: 'runs passed', color: 'var(--good)', value: (d) => d.runs.success },
  { label: 'runs failed', color: 'var(--critical)', value: (d) => d.runs.failure },
  { label: 'runs other', color: 'var(--muted)', value: (d) => d.runs.other },
];

const CORPUS_SERIES = [
  { label: 'checks executed', color: 'var(--good)', value: (d) => d.checkRuns },
  { label: 'of those, catching something', color: 'var(--critical)', value: (d) => d.checkFailures },
];

// What the corpus did across the fleet, from the members' own folds. Runs and findings
// share a scale here — unlike the repo page's rule-tokens-against-checks pair — because
// the second is a SUBSET of the first and reading it as a share is the whole point.
// The two charts that stayed. The other two went to the sheet above, where each
// answers its question in the place it is acted on: the corpus card's thirty days of
// bars are the corpus section's job below the grid, and the ledger keeps the one
// figure with a spark; *members moved* is the pulse's hover and the grid's own
// activity column.
function renderActivity(series) {
  const charts = $('fleet-activity');
  const pass = series.totals.runs
    ? Math.round(((series.totals.runs - series.totals.runsFailed) / series.totals.runs) * 100)
    : null;

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
  );
}

// A member whose read has not landed yet. It is a row from the first paint rather
// than a gap that fills in, because a fleet page that appears all at once at the end
// looks broken for the whole sweep — and on a slow or throttled read, the sweep is
// most of the time the viewer spends here.
const pendingRow = (repo) => el('tr', { className: 'pending-row' }, [
  el('td', {}, [el('div', { className: 'member' }, [
    el('div', {}, [
      el('span', { className: 'name', textContent: repo.split('/')[1] ?? repo }),
      el('div', { className: 'sub' }, [repoLink(repo)]),
    ]),
  ])]),
  el('td', { colSpan: MEMBER_COLS - 1 }, [el('span', { className: 'sub', textContent: 'reading…' })]),
]);


// --- the ledger sheet ---------------------------------------------------------------

// The whole block above the members grid, in the identity's own form: one ruled sheet
// with a stub column, four bands, and a fifth naming where the grid begins.
//
// It replaced the benefits tiles, the glance tiles and two of the four activity charts.
// Nothing those said is lost — each fact moved to where it is acted on, which is the
// spec's "deliberately absent" list: *members need you* is the slip's `N more`,
// *schedulers failing* and *mounts behind* are the machine, *items parked* and
// *minutes of your time* are the stuck row and the slip.
//
// EVERY VERDICT ARRIVES MADE. This function chooses no level, tints no delta and
// invents no sentence: `fleetLedger` and `machinePanel` decided all of it, and a
// figure with no number carries the sentence saying why.
// Exported so the sheet can be driven against a fixture — the layout and the gap
// sentences are the parts a unit test cannot see.
export function renderSheet({ ledger, machine, candidates, sweeping, progress, strip }) {
  const page = $('fleet-sheet');
  const top = candidates[0] ?? null;
  const rest = Math.max(0, candidates.length - 1);

  // START HERE — the slip, the one warm object on a cool sheet.
  const startBody = sweeping && !top
    ? el('div', { className: 'slip' }, [
      el('span', { className: 'hl', textContent: 'Reading the fleet…' }),
      el('span', { className: 'more', textContent: `${progress.done}/${progress.total} members read — nothing waiting on you in those` }),
    ])
    : (top
      ? slip({
        headline: top.why,
        where: `${top.repo}${top.number != null ? ` · #${top.number}` : ''}`,
        href: top.url,
        chip: parkChip(top),
        more: [
          rest ? `${rest} more after this one` : null,
          ...candidates.slice(1, 3).map((c) => `${c.repo.split('/')[1] ?? c.repo} ${c.why.toLowerCase()}`),
        ].filter(Boolean).join(' · '),
      })
      : el('div', { className: 'slip' }, [
        el('span', { className: 'hl', textContent: 'Nothing is waiting on you' }),
        el('span', { className: 'more', textContent: 'nothing read here is parked, failing or behind' }),
      ]));

  // THE MACHINE — five cells in one row.
  const m = machine;
  const machineBody = el('div', { className: 'machine' }, [
    machineCell({
      level: m.heartbeat.level, label: 'Scheduler',
      value: m.heartbeat.total ? m.heartbeat.onTime : null,
      unit: m.heartbeat.total ? `of ${m.heartbeat.total} ran on time` : 'no member read',
      note: m.heartbeat.note,
      extra: m.heartbeat.beats.length ? beats(m.heartbeat.beats) : null,
    }),
    machineCell({
      level: m.executor.level, label: 'Executor',
      value: m.executor.failed,
      unit: `of ${m.executor.runs} failed, 24h`,
      note: m.executor.inFlight ? `${m.executor.inFlight} in flight · ${m.executor.note}` : m.executor.note,
    }),
    machineCell({
      level: m.foldAge.level, label: 'Fold age',
      value: m.foldAge.age === null ? null : fmtAge(m.foldAge.age),
      unit: 'oldest', note: m.foldAge.note,
    }),
    machineCell({
      level: m.drift.level, label: 'Drift',
      value: m.drift.behind, unit: 'behind', note: m.drift.note,
    }),
    machineCell({
      level: m.wake.level, label: 'Next wake',
      value: m.wake.at ? `${m.wake.at.slice(11)}:00` : null,
      unit: m.wake.at
        ? `${m.wake.members || m.wake.tasks} ${m.wake.members ? 'members' : 'tasks'}`
        : (m.wake.read ? 'nothing in 24 h' : 'not read'),
      note: m.wake.note,
      extra: strip ? wakeTicks(strip) : null,
    }),
  ]);

  // THIS WEEK — the three columns, their totals under a double rule, and the per-member
  // expand the totals row discloses.
  const column = (name, question, figs, formats) => el('div', { className: 'col' }, [
    el('h3', {}, [
      el('span', { className: 'cap', textContent: name }),
      el('span', { className: 'q', textContent: question }),
    ]),
    ...figs.map((f, i) => figureRow(f, { format: formats[i] })),
  ]);

  const t = ledger.totals;
  const detail = el('div', { className: 'detail', hidden: true }, [
    detailTable(
      [{ label: 'Member' }, { label: 'Sessions', num: true }, { label: 'Turns', num: true },
        { label: 'Tokens in', num: true }, { label: 'Caught', num: true }, { label: 'Rule tok/session', num: true }],
      perMemberRows(ledger),
    ),
  ]);

  const totals = el('div', { className: 'totals' }, [
    el('div', {}, [
      el('b', { textContent: t.costPerMerged === null ? '—' : `≈$${t.costPerMerged}` }),
      'per merged PR',
      el('span', { className: 'sub', textContent: t.tokensPerMerged === null ? 'not recorded' : `${fmtTokens(Math.round(t.tokensPerMerged))} tok each` }),
    ]),
    el('div', {}, [
      el('b', { textContent: t.autonomy === null ? '—' : `${Math.round(t.autonomy * 100)}%` }),
      'autonomy',
      el('span', { className: 'sub', textContent: t.humanToAgent === null ? 'yours : agent minutes not recorded' : `yours : agent minutes 1 : ${t.humanToAgent}` }),
    ]),
    el('div', {}, [
      el('b', { textContent: t.caught === null ? '—' : String(t.caught) }),
      'would have shipped broken',
      el('span', { className: 'sub', textContent: `${ledger.window.folding} of ${ledger.window.members} fold` }),
      expander('per member', detail),
    ]),
  ]);

  // The assumptions, in the one place the identity gives them: a disclosed block under
  // the ledger, so a sub-line stays a second ACTIONABLE figure rather than a footnote.
  const counted = el('div', { className: 'detail counted', hidden: true }, [
    el('ul', {}, [
      el('li', { textContent: 'The window is seven days against the seven before it, and every figure is summed over the members whose fold answered — never over the fleet. A figure no member could answer says so; it is never a zero.' }),
      el('li', { textContent: 'Tokens in counts cache reads and cache writes as input, because that is what the turn was billed for. Dollars price each model against your own rate table, per counter; a model with no rate is an unpriced remainder and is never folded into the sum.' }),
      el('li', { textContent: 'Your minutes bills each human turn the gap since the previous entry, capped at ten minutes — a session left open overnight is not a night of your attention, so the figure is a floor. Subagent turns are excluded: their time is already inside the turn around them.' }),
      el('li', { textContent: 'Lead times are medians over the PRs merged in the window, from the durations the fold carries plus the merged PRs this page already read. A percentile does not fold, so it is computed over the window shown rather than averaged from stored ones.' }),
      el('li', { textContent: 'A delta is set in ink unless the figure\'s own bad-when rule fires. A slower week is a figure, not a verdict, and nothing good is coloured — nothing good needs a person.' }),
    ]),
  ]);

  const weekBody = [
    el('div', { className: 'ledger' }, [
      column('Got', 'what the fleet produced', ledger.ledger.got, [String, String, String, fmtCount]),
      column('Cost', 'what it took', ledger.ledger.cost, [fmtTokens, (n) => `≈$${n}`, fmtSeconds, fmtTokens]),
      column('Speed', 'how fast it moves, where it sticks', ledger.ledger.speed, [fmtHours, fmtHours, String, String]),
    ]),
    totals,
    detail,
    el('div', { className: 'counted-link' }, [expander('how these are counted', counted)]),
    counted,
  ];

  // PULSE — the block's one chart at readable size.
  const pulseNote = [
    ledger.pulse.peak === null ? 'nothing folded' : `peak ${ledger.pulse.peak}`,
    ledger.pulse.quiet.length ? `${ledger.pulse.quiet.length} quiet days` : null,
    'today not folded yet',
  ].filter(Boolean).join(' · ');

  page.replaceChildren(
    band('Start here', 'worst thing needing a person', startBody, { aria: 'Start here' }),
    band('The machine', 'is it running, right now, on every member', machineBody, { aria: 'The machine' }),
    band('This week', `against last · ${ledger.window.from} – ${ledger.window.to} vs ${ledger.window.prevFrom} – ${ledger.window.prevTo} · ${ledger.window.folding} folding members`,
      weekBody, { aria: 'This week against last' }),
    band('Pulse', 'sessions / day, 14 days',
      el('div', { className: 'pulse' }, [pulseChart(ledger.pulse), el('span', { className: 'n', textContent: pulseNote })]),
      { aria: 'Pulse' }),
    band('Members', null, '▼ worst first · the grid begins here', { className: 'next' }),
  );
}

// The park kind is the category the reader scans for, and the minutes are in the
// sentence beside it. Work the estimate does not cover shows no figure rather than a
// zero — a broken scheduler is not a queue to get through.
function parkChip(candidate) {
  const minutes = parkMinutes(candidate.park);
  const kind = candidate.park ? String(candidate.park).split('-').pop() : null;
  if (minutes == null) return kind ? `${kind} · no time estimate` : 'no time estimate';
  return `${parkMinutesNote(candidate.park) ? '≥ ' : ''}${minutes} min${kind ? ` · ${kind}` : ''}`;
}

// A count a reader compares at a glance: grouped under a thousand thousand, and
// abbreviated past it, since a seven-digit line count is a shape rather than a number.
const fmtCount = (n) => (Math.abs(n) >= 1e6 ? fmtTokens(n) : Number(n).toLocaleString('en-US'));

const fmtSeconds = (s) => {
  if (s === null || !Number.isFinite(s)) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

// The expand's rows: the grid's members with the ledger's columns. Members that do not
// fold are listed under it as counted in nothing above, rather than as zeros.
function perMemberRows(ledger) {
  const rows = [];
  for (const m of ledger.perMember ?? []) {
    rows.push([
      m.repo.split('/')[1] ?? m.repo,
      m.sessions ?? '—', m.turns ?? '—',
      m.tokensIn === null ? '—' : fmtTokens(m.tokensIn),
      m.caught ?? '—',
      m.tokensPerSession === null ? '—' : fmtTokens(m.tokensPerSession),
    ]);
  }
  if (ledger.window.absent.length) {
    rows.push([
      { text: ledger.window.absent.map((r) => r.split('/')[1] ?? r).join(', '), gap: true },
      { text: 'no fold · counted in nothing above', gap: true, colSpan: 5 },
    ]);
  }
  return rows;
}

function renderFleet(summaries, reads, now, onOpen, canon, progress = null, deployment = null) {
  const resolved = summaries.filter(Boolean);
  const pending = summaries.map((s, i) => (s ? null : reads.names?.[i])).filter(Boolean);
  const roll = rollUp(resolved);

  // The prod, before every panel that reports. Mid-sweep it says so rather than
  // claiming a clean fleet: "nothing is waiting on you" read off four of forty members
  // is a wrong statement, not a partial one.
  const candidates = fleetCandidates(resolved);
  const sweeping = Boolean(progress && progress.done < progress.total);

  // Every figure the sheet draws, decided in one place. `rates` is the deployment's
  // own table and unset is a supported state — the dollar figure then reads unpriced
  // and names the key rather than showing a price nobody set.
  const resolvedReads = reads.filter(Boolean);
  const ledger = fleetLedger(resolvedReads, { now, rates: deployment?.rates ?? gh.config?.rates ?? null });
  // The wake strip needs each task's own declared anchor, and a member read carries
  // its task paths rather than their contents. So the strip is built from whatever
  // rosters reached this page — none, today — and `machinePanel` states the absence
  // rather than drawing an empty 24 hours, which would read as "nothing wakes".
  const rosterRows = resolved.flatMap((s) => (s.roster ?? []).map((row) => ({ ...row, repo: s.repo })));
  const strip = rosterRows.length ? wakeStrip(rosterRows, now) : null;
  renderSheet({
    ledger,
    machine: machinePanel(resolved, resolvedReads, { now, canon, strip }),
    candidates,
    sweeping,
    progress,
    strip,
  });

  // Every number above is a number about the members READ SO FAR, and a partial
  // rollup that does not say so is a wrong one. The count is stated rather than the
  // page waiting to be sure.
  //
  // Ranked is not the same as finished. Once every member has been through the
  // attention pass the figures are true of the whole fleet, but the passes behind
  // them — trees, folds, pack cards, graphs — are still filling columns in, and a
  // line reading "40 repos read" over a table still growing columns claims a
  // completeness the page does not have yet. So the pass says so while it runs.
  $('fleet-progress').textContent = progress && progress.done < progress.total
    ? `${progress.done}/${progress.total} repos read — figures below cover those`
    : (progress
      ? `${progress.total} repos read${progress.label ? ` — ${progress.label.toLowerCase()}…` : ''}`
      : '');

  // One `<tbody>` per member — see `memberRows`. The head's own tbody carries the
  // empty state and the still-reading rows, and is moved to the END once the members
  // are in, so a repo still being read does not appear above the ones already ranked.
  const table = $('fleet');
  const body = groupedHead(table, MEMBER_GROUPS);
  if (!summaries.length) { body.append(emptyRow(MEMBER_COLS, 'No members in the roster.')); return; }
  for (const s of rankMembers(resolved)) table.append(el('tbody', { className: 'm' }, memberRows(s, onOpen, now)));
  for (const repo of pending) body.append(pendingRow(repo));
  table.append(body);

  // Tasks across the fleet. This is the view a per-repo page structurally cannot
  // give: a shared pack's task parked in four members at once is a canon problem,
  // and in any single repo it looks like that repo's bad luck.
  renderDeployment(deployment, now);
  renderActivity(activitySeries(resolvedReads, { now }));
  renderCorpus(fleetCorpus(resolvedReads, { now }), onOpen);

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
  // Read before the sweep so the panel is there from the first paint: it is two small
  // reads, and it is the thing a viewer opening this page in the morning came for.

  // Rendered on every arrival rather than once at the end: the page is useful from
  // the first member back, and the member a viewer opened it for may be the first.
  const reads = new Array(repos.length).fill(null);
  reads.names = repos;
  const summaries = new Array(repos.length).fill(null);
  // The deployment's own cards, read once. Its repos are usually members too, so on a
  // fleet page this is served out of the same caches the sweep fills.
  let deployment = null;
  // What the page is allowed to claim right now: how many members are RANKED (not how
  // many have been touched), and which pass is filling the rest in.
  let progress = { done: 0, total: repos.length, label: null };
  const paint = () => renderFleet(summaries, reads, now, onOpen, canon, progress, deployment);
  paint();
  readDeploymentContributions({ config, token, gh })
    .then((d) => { deployment = d; paint(); })
    .catch(() => { /* a deployment card that cannot be read is a section that stays hidden */ });

  // One state object per member, carried through every pass and filled in as the
  // passes reach it.
  const members = repos.map((repo, i) => ({ repo, i, read: null }));
  // Who each pass after the first has anything to ask about. A repo that does not run
  // Claudinite, and one whose first read failed, are both already everything the page
  // will ever say about them.
  const adopted = (m) => Boolean(m.read?.declaration) && !m.read?.error;

  await sweepPhases({
    members,
    phases: [
      {
        id: 'identity',
        label: 'Identifying members',
        run: async (m) => {
          m.read = await readIdentity(m.repo, token);
          reads[m.i] = m.read;
          // The canon side of the mount comparison, priced from what this member
          // stamps. In this pass rather than beside the summary, so every member's
          // packs are priced before the first row claims a mount is current.
          await priceStampedPacks(canon, m.read.declaration);
        },
      },
      { id: 'attention', label: 'Reading queues', appliesTo: adopted, run: (m) => readAttention(m.read, token) },
      { id: 'depth', label: 'Reading trees and folds', appliesTo: adopted, run: (m) => readDepth(m.read, token) },
      { id: 'packs', label: 'Reading what the packs report', appliesTo: adopted, run: (m) => readPackCards(m.read, token) },
      { id: 'activity', label: 'Reading commit graphs', appliesTo: adopted, run: (m) => readCommitGraph(m.read, token) },
    ],
    onAdvance: ({ phase, label, done, total, member }) => {
      if (member?.read) {
        // A member is summarised as soon as it is finished being a candidate for a
        // later pass to change — which for an adopted member is when the attention
        // pass lands, never before it: `summariseMember` reads an unread queue as an
        // empty one, and a row saying "nothing parked" about a member whose issues
        // have not been fetched is a wrong statement rather than a partial one.
        const ranked = phase !== 'identity' || !adopted(member);
        if (ranked) summaries[member.i] = summariseMember(member.read, { now, canon });
      }
      progress = { done: summaries.filter(Boolean).length, total: repos.length, label };
      onProgress?.({ phase, label, done, total, repo: member?.repo ?? null });
      paint();
    },
  });

  const failed = summaries.filter((s) => s?.status === 'unreadable');
  // Surfaced once at the top rather than as twelve separate errors: on a fleet, some
  // members being invisible to you is the normal case, not an incident.
  if (failed.length === repos.length && repos.length > 0) {
    onError?.(`None of the ${repos.length} members could be read — check that you are signed in with an account that can see them.`);
  }

  progress = { done: summaries.filter(Boolean).length, total: repos.length, label: null };
  paint();
  return { summaries: summaries.filter(Boolean), now, canon };
}
